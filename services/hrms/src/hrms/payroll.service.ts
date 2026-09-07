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

    return payslip;
  }
}
