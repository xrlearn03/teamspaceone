import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import { createEventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { HrmsScopeService } from './scope.service.js';
import type { RequestContextInput } from './employees.service.js';

interface SalaryJson {
  base?: number;
  currency?: string;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scope: HrmsScopeService,
  ) {}

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
   * Skeleton payroll run: marks the period approved and generates a draft
   * payslip for every active employee that has a salary JSON configured.
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

      let generated = 0;
      for (const employee of employees) {
        const salary = (employee.salary ?? {}) as SalaryJson;
        const base = typeof salary.base === 'number' ? salary.base : 0;
        await tx.payslip.upsert({
          where: {
            employeeId_payrollPeriodId: {
              employeeId: employee.id,
              payrollPeriodId: id,
            },
          },
          update: {},
          create: {
            organisationId: ctx.organisationId,
            employeeId: employee.id,
            payrollPeriodId: id,
            earnings: { base },
            deductions: {},
            grossPay: base,
            netPay: base,
            currency: salary.currency ?? 'USD',
            status: 'draft',
          },
        });
        generated++;
      }

      const updated = await tx.payrollPeriod.update({
        where: { id },
        data: {
          status: 'approved',
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
