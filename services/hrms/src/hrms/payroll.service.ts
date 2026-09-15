import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import { createEventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { HrmsScopeService } from './scope.service.js';
import type { RequestContextInput } from './employees.service.js';
import { calculateIndiaPayslip, INDIA_NEW_REGIME_SLABS, type IndiaPayrollPolicy, type IndiaSalary } from './india-payroll.js';

function renderPdf(render: (document: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    render(document);
    document.end();
  });
}

function money(value: unknown, currency: string) {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}

function weekdays(start: Date, end: Date): Date[] {
  const result: Date[] = [];
  const current = new Date(start);
  current.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (current <= last) {
    if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) result.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scope: HrmsScopeService,
  ) {}

  getPolicy(organisationId: string) {
    return this.prisma.payrollPolicy.upsert({
      where: { organisationId },
      update: {},
      create: { organisationId, taxSlabs: INDIA_NEW_REGIME_SLABS },
    });
  }

  async updatePolicy(organisationId: string, input: Partial<IndiaPayrollPolicy>) {
    const numericFields = ['employeePfRate', 'employerPfRate', 'pfMonthlyWageCeiling', 'employeeEsiRate', 'employerEsiRate', 'esiMonthlyGrossCeiling', 'standardDeductionAnnual', 'rebateTaxableIncomeLimit', 'rebateMaximum', 'cessRate'] as const;
    const data: Record<string, unknown> = {};
    for (const field of numericFields) {
      const value = input[field];
      if (value !== undefined) {
        if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`${field} must be a non-negative number`);
        data[field] = value;
      }
    }
    if (input.taxSlabs) {
      if (!input.taxSlabs.length || input.taxSlabs.some((slab) => slab.rate < 0 || slab.rate > 1 || (slab.upTo !== null && slab.upTo <= 0))) {
        throw new BadRequestException('Invalid income-tax slabs');
      }
      data.taxSlabs = input.taxSlabs;
    }
    await this.getPolicy(organisationId);
    return this.prisma.payrollPolicy.update({ where: { organisationId }, data });
  }

  listPeriods(organisationId: string) {
    return this.prisma.payrollPeriod.findMany({
      where: { organisationId },
      orderBy: { startDate: 'desc' },
    });
  }

  createPeriod(
    organisationId: string,
    input: { name: string; startDate: Date; endDate: Date },
  ) {
    return this.prisma.payrollPeriod.create({
      data: {
        organisationId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });
  }

  /**
   * Generates India payroll payslips using organisation policy, statutory
   * deductions, joining-date proration, absences, and approved unpaid leave.
   */
  async processPeriod(ctx: RequestContextInput, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    if (period.status === 'paid') {
      throw new BadRequestException('Payroll period already paid');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.payrollPeriod.update({
        where: { id },
        data: { status: 'processing' },
      });

      const employees = await tx.employee.findMany({
        where: {
          organisationId: ctx.organisationId,
          status: 'active',
          salary: { not: Prisma.DbNull },
        },
      });

      const policyRecord = await tx.payrollPolicy.upsert({
        where: { organisationId: ctx.organisationId },
        update: {},
        create: { organisationId: ctx.organisationId, taxSlabs: INDIA_NEW_REGIME_SLABS },
      });
      const policy = { ...policyRecord, taxSlabs: policyRecord.taxSlabs as unknown as IndiaPayrollPolicy['taxSlabs'] };
      const employeeIds = employees.map((employee) => employee.id);
      const [attendance, unpaidLeave] = await Promise.all([
        tx.attendanceRecord.findMany({
          where: { organisationId: ctx.organisationId, employeeId: { in: employeeIds }, date: { gte: period.startDate, lte: period.endDate }, status: 'absent' },
          select: { employeeId: true, date: true },
        }),
        tx.leaveRequest.findMany({
          where: { organisationId: ctx.organisationId, employeeId: { in: employeeIds }, status: 'approved', startDate: { lte: period.endDate }, endDate: { gte: period.startDate }, leaveType: { isPaid: false } },
          select: { employeeId: true, startDate: true, endDate: true },
        }),
      ]);
      const scheduledDates = weekdays(period.startDate, period.endDate);

      let generated = 0;
      for (const employee of employees) {
        const salary = (employee.salary ?? {}) as IndiaSalary;
        const eligibleDates = scheduledDates.filter((date) => !employee.joiningDate || date >= employee.joiningDate);
        const unpaidDates = new Set<string>();
        attendance.filter((record) => record.employeeId === employee.id).forEach((record) => unpaidDates.add(record.date.toISOString().slice(0, 10)));
        unpaidLeave.filter((request) => request.employeeId === employee.id).forEach((request) => {
          weekdays(request.startDate < period.startDate ? period.startDate : request.startDate, request.endDate > period.endDate ? period.endDate : request.endDate)
            .forEach((date) => unpaidDates.add(date.toISOString().slice(0, 10)));
        });
        const payableDays = eligibleDates.filter((date) => !unpaidDates.has(date.toISOString().slice(0, 10))).length;
        const payableRatio = eligibleDates.length ? payableDays / eligibleDates.length : 0;
        const calculated = calculateIndiaPayslip(salary, policy, payableRatio);
        await tx.payslip.upsert({
          where: {
            employeeId_payrollPeriodId: {
              employeeId: employee.id,
              payrollPeriodId: id,
            },
          },
          update: {
            earnings: { ...calculated.earnings, employerContributions: calculated.employerContributions, payableDays, scheduledDays: eligibleDates.length },
            deductions: calculated.deductions,
            grossPay: calculated.grossPay,
            netPay: calculated.netPay,
            currency: salary.currency ?? 'INR',
          },
          create: {
            organisationId: ctx.organisationId,
            employeeId: employee.id,
            payrollPeriodId: id,
            earnings: { ...calculated.earnings, employerContributions: calculated.employerContributions, payableDays, scheduledDays: eligibleDates.length },
            deductions: calculated.deductions,
            grossPay: calculated.grossPay,
            netPay: calculated.netPay,
            currency: salary.currency ?? 'INR',
            status: 'draft',
          },
        });
        generated++;
      }

      const updated = await tx.payrollPeriod.update({
        where: { id },
        data: {
          status: 'processed',
          processedBy: ctx.actorId,
          processedAt: new Date(),
        },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.payroll.period.processed',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'payroll-period',
        resourceId: id,
        payload: { payslipsGenerated: generated },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return { period: updated, payslipsGenerated: generated };
    });
  }

  async listPayslips(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { employeeId?: string; periodId?: string },
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const scopeWhere = this.scope.payslipWhere(user, resolved);

    if (filters.employeeId && !can(user, 'hrms.payroll.manage')) {
      if (filters.employeeId !== resolved.actorEmployee?.id) {
        throw new ForbiddenException('You may only view your own payslips');
      }
    }

    return this.prisma.payslip.findMany({
      where: {
        organisationId: ctx.organisationId,
        AND: [scopeWhere],
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.periodId ? { payrollPeriodId: filters.periodId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayslip(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');

    if (!can(user, 'hrms.payroll.manage')) {
      const actorEmployee = await this.scope.getActorEmployee(
        ctx.organisationId,
        user.id,
      );
      if (!actorEmployee || payslip.employeeId !== actorEmployee.id) {
        throw new ForbiddenException('You may only view your own payslips');
      }
    }

    // Payroll access is sensitive: record an audit event for every payslip
    // view. The audit service consumes the HRMS stream automatically.
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.payroll.payslip.viewed',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'payslip',
        resourceId: payslip.id,
        payload: { employeeId: payslip.employeeId },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);
    });

    return payslip;
  }

  async payslipPdf(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    await this.getPayslip(ctx, user, id);
    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      include: { employee: true, payrollPeriod: true },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');
    const earnings = (payslip.earnings ?? {}) as Record<string, unknown>;
    const deductions = (payslip.deductions ?? {}) as Record<string, unknown>;
    const buffer = await renderPdf((document) => {
      document.fontSize(20).text('Payslip', { align: 'center' }).moveDown();
      document.fontSize(11).text(`Employee: ${payslip.employee.firstName} ${payslip.employee.lastName}`);
      document.text(`Employee number: ${payslip.employee.employeeNumber ?? '—'}`);
      document.text(`Pay period: ${payslip.payrollPeriod.name}`).moveDown();
      document.fontSize(14).text('Earnings');
      for (const [label, value] of Object.entries(earnings)) {
        if (typeof value === 'number') document.fontSize(10).text(`${label}: ${money(value, payslip.currency)}`);
      }
      document.moveDown().fontSize(14).text('Deductions');
      for (const [label, value] of Object.entries(deductions)) {
        if (typeof value === 'number') document.fontSize(10).text(`${label}: ${money(value, payslip.currency)}`);
      }
      document.moveDown().fontSize(12).text(`Gross pay: ${money(payslip.grossPay, payslip.currency)}`);
      document.fontSize(14).text(`Net pay: ${money(payslip.netPay, payslip.currency)}`);
      document.moveDown(2).fontSize(9).fillColor('#666666').text('This document was generated electronically by Teamspace One.');
    });
    return { buffer, filename: `payslip-${payslip.payrollPeriod.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf` };
  }

  async salaryCertificatePdf(ctx: RequestContextInput, user: AuthorizableUser) {
    const employee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (!employee) throw new NotFoundException('Employee record not found');
    const salary = (employee.salary ?? {}) as IndiaSalary;
    if (!salary.base) throw new NotFoundException('Salary configuration not found');
    const currency = salary.currency ?? 'INR';
    const monthlyGross = Number(salary.base ?? 0) + Number(salary.hra ?? 0) + Number(salary.specialAllowance ?? 0) + Number(salary.otherAllowances ?? 0);
    const buffer = await renderPdf((document) => {
      document.fontSize(20).text('Salary Certificate', { align: 'center' }).moveDown(2);
      document.fontSize(11).text(`Date: ${new Date().toLocaleDateString('en-IN')}`).moveDown();
      document.text(`This is to certify that ${employee.firstName} ${employee.lastName}, employee number ${employee.employeeNumber ?? '—'}, is employed with the organisation as a ${employee.employmentType.replace(/_/g, ' ')} employee.`).moveDown();
      document.text(`The employee's current monthly gross salary is ${money(monthlyGross, currency)} and annualised gross salary is ${money(monthlyGross * 12, currency)}.`).moveDown(2);
      document.text('This certificate is issued at the employee’s request for official purposes.');
      document.moveDown(3).text('Authorised Signatory');
      document.fontSize(9).fillColor('#666666').text('Electronically generated by Teamspace One.');
    });
    return { buffer, filename: `salary-certificate-${employee.employeeNumber ?? employee.id}.pdf` };
  }

  async listTaxDocuments(ctx: RequestContextInput, user: AuthorizableUser, employeeId?: string) {
    const actorEmployee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    const targetId = employeeId ?? actorEmployee?.id;
    if (!targetId) throw new NotFoundException('Employee record not found');
    if (targetId !== actorEmployee?.id && !can(user, 'hrms.payroll.manage')) {
      throw new ForbiddenException('You may only view your own tax documents');
    }
    return this.prisma.payrollTaxDocument.findMany({
      where: { organisationId: ctx.organisationId, employeeId: targetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTaxDocument(ctx: RequestContextInput, user: AuthorizableUser, input: { financialYear: string; category: string; fileId: string; name: string; declaredAmount?: number }) {
    const employee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (!employee) throw new NotFoundException('Employee record not found');
    if (!/^\d{4}-\d{2}$/.test(input.financialYear)) throw new BadRequestException('financialYear must use YYYY-YY format');
    if (!input.category?.trim() || !input.fileId?.trim() || !input.name?.trim()) throw new BadRequestException('category, fileId and name are required');
    if (input.declaredAmount !== undefined && (!Number.isFinite(input.declaredAmount) || input.declaredAmount < 0)) throw new BadRequestException('declaredAmount must be non-negative');
    return this.prisma.payrollTaxDocument.create({
      data: { organisationId: ctx.organisationId, employeeId: employee.id, financialYear: input.financialYear, category: input.category.trim(), fileId: input.fileId, name: input.name.trim(), declaredAmount: input.declaredAmount },
    });
  }

  async listReimbursements(ctx: RequestContextInput, user: AuthorizableUser, employeeId?: string) {
    const actorEmployee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    const targetId = employeeId ?? actorEmployee?.id;
    if (!targetId) throw new NotFoundException('Employee record not found');
    if (targetId !== actorEmployee?.id && !can(user, 'hrms.payroll.manage')) {
      throw new ForbiddenException('You may only view your own reimbursements');
    }
    return this.prisma.reimbursementClaim.findMany({
      where: { organisationId: ctx.organisationId, employeeId: targetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReimbursement(ctx: RequestContextInput, user: AuthorizableUser, input: { category: string; description: string; amount: number; currency?: string; expenseDate: Date; receiptFileId?: string }) {
    const employee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (!employee) throw new NotFoundException('Employee record not found');
    if (!input.category?.trim() || !input.description?.trim()) throw new BadRequestException('category and description are required');
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new BadRequestException('amount must be greater than zero');
    if (Number.isNaN(input.expenseDate.getTime()) || input.expenseDate > new Date()) throw new BadRequestException('expenseDate must be a valid date that is not in the future');
    return this.prisma.reimbursementClaim.create({
      data: { organisationId: ctx.organisationId, employeeId: employee.id, category: input.category.trim(), description: input.description.trim(), amount: input.amount, currency: input.currency?.trim() || 'INR', expenseDate: input.expenseDate, receiptFileId: input.receiptFileId },
    });
  }

  async reviewReimbursement(ctx: RequestContextInput, id: string, input: { status: 'approved' | 'rejected' | 'paid'; reviewNote?: string }) {
    const claim = await this.prisma.reimbursementClaim.findFirst({ where: { id, organisationId: ctx.organisationId } });
    if (!claim) throw new NotFoundException('Reimbursement not found');
    const allowed = claim.status === 'submitted' ? ['approved', 'rejected'] : claim.status === 'approved' ? ['paid'] : [];
    if (!allowed.includes(input.status)) throw new BadRequestException(`Cannot change reimbursement from ${claim.status} to ${input.status}`);
    return this.prisma.reimbursementClaim.update({
      where: { id },
      data: { status: input.status, reviewedBy: ctx.actorId, reviewedAt: new Date(), reviewNote: input.reviewNote, paidAt: input.status === 'paid' ? new Date() : undefined },
    });
  }

  async approvePeriod(ctx: RequestContextInput, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    if (period.status !== 'processed') {
      throw new BadRequestException('Period must be in processed status to be approved');
    }

    return this.prisma.payrollPeriod.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: ctx.actorId,
        approvedAt: new Date(),
      },
    });
  }

  async markPaid(ctx: RequestContextInput, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    if (period.status !== 'approved') {
      throw new BadRequestException('Period must be approved before it can be marked as paid');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.payrollPeriod.update({
        where: { id },
        data: {
          status: 'paid',
          paidBy: ctx.actorId,
          paidAt: new Date(),
        },
      });

      await tx.payslip.updateMany({
        where: { payrollPeriodId: id, organisationId: ctx.organisationId },
        data: { status: 'paid' },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.payroll.period.paid',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'payroll-period',
        resourceId: id,
        payload: { periodId: id },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });
  }

  async exportCsv(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
  ): Promise<string> {
    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const scopeWhere = this.scope.payslipWhere(user, resolved);

    const payslips = await this.prisma.payslip.findMany({
      where: {
        payrollPeriodId: id,
        organisationId: ctx.organisationId,
        AND: [scopeWhere],
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = payslips.map((p) => {
      const name = `${p.employee.firstName ?? ''} ${p.employee.lastName ?? ''}`.trim();
      return [
        p.employeeId,
        `"${name}"`,
        p.grossPay,
        p.netPay,
        p.currency,
        p.status,
        JSON.stringify(p.earnings ?? {}),
        JSON.stringify(p.deductions ?? {}),
      ];
    });

    const header = [
      'employeeId',
      'employeeName',
      'grossPay',
      'netPay',
      'currency',
      'status',
      'earnings',
      'deductions',
    ];
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.payroll.exported',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'payroll-period',
        resourceId: id,
        payload: { periodId: id, actorId: ctx.actorId },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);
    });

    return csv;
  }

  async summary(ctx: RequestContextInput, user: AuthorizableUser) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const scopeWhere = this.scope.payslipWhere(user, resolved);

    const periods = await this.prisma.payrollPeriod.findMany({
      where: { organisationId: ctx.organisationId },
      orderBy: { endDate: 'desc' },
      include: {
        payslips: {
          where: {
            organisationId: ctx.organisationId,
            AND: [scopeWhere],
          },
          select: { grossPay: true, netPay: true },
        },
      },
    });

    return periods.map((period) => ({
      periodId: period.id,
      name: period.name,
      status: period.status,
      headcount: period.payslips.length,
      grossTotal: period.payslips.reduce((sum, p) => sum + (p.grossPay ?? 0), 0),
      netTotal: period.payslips.reduce((sum, p) => sum + p.netPay, 0),
    }));
  }
}
