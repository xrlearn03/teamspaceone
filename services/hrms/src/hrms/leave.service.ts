import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import { createEventEnvelope } from '@teamspace-one/event-contracts';
import type { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { HrmsScopeService } from './scope.service.js';
import type { RequestContextInput } from './employees.service.js';

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scope: HrmsScopeService,
  ) {}

  listTypes(organisationId: string) {
    return this.prisma.leaveType.findMany({
      where: { organisationId },
      orderBy: { name: 'asc' },
    });
  }

  createType(
    organisationId: string,
    input: { name: string; code: string; annualQuota?: number; isPaid?: boolean },
  ) {
    return this.prisma.leaveType.create({
      data: {
        organisationId,
        name: input.name,
        code: input.code,
        annualQuota: input.annualQuota ?? 0,
        isPaid: input.isPaid ?? true,
      },
    });
  }

  async listBalances(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    employeeId?: string,
    year?: number,
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);

    let targetId = employeeId;
    if (!targetId) {
      if (!resolved.actorEmployee) {
        throw new NotFoundException('No employee record for current user');
      }
      targetId = resolved.actorEmployee.id;
    }

    const target = await this.prisma.employee.findFirst({
      where: { id: targetId, organisationId: ctx.organisationId },
    });
    if (!target) throw new NotFoundException('Employee not found');
    if (!this.scope.canSeeEmployee(resolved, target)) {
      throw new ForbiddenException('Employee is outside your data scope');
    }

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        organisationId: ctx.organisationId,
        employeeId: target.id,
        ...(year ? { year } : {}),
      },
      include: { leaveType: true },
    });

    return balances.map((b) => ({
      ...b,
      leaveTypeName: b.leaveType?.name ?? null,
      remaining: b.entitled - b.used,
    }));
  }

  async apply(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    input: {
      leaveTypeId: string;
      startDate: Date;
      endDate: Date;
      days: number;
      reason?: string;
    },
  ) {
    const employee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (!employee) {
      throw new NotFoundException('No employee record for current user');
    }
    if (input.days <= 0) {
      throw new BadRequestException('days must be positive');
    }

    const year = input.startDate.getFullYear();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const leaveType = await tx.leaveType.findFirst({
        where: { id: input.leaveTypeId, organisationId: ctx.organisationId, isActive: true },
      });
      if (!leaveType) throw new NotFoundException('Leave type not found');

      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            year,
          },
        },
      });
      if (balance && balance.entitled - balance.used < input.days) {
        throw new BadRequestException('Insufficient leave balance');
      }

      const request = await tx.leaveRequest.create({
        data: {
          organisationId: ctx.organisationId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate: input.startDate,
          endDate: input.endDate,
          days: input.days,
          reason: input.reason,
          managerId: employee.managerEmployeeId,
        },
      });

      const manager = employee.managerEmployeeId
        ? await tx.employee.findFirst({
            where: { id: employee.managerEmployeeId, organisationId: ctx.organisationId },
            select: { userId: true },
          })
        : null;

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.leave.requested',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'leave-request',
        resourceId: request.id,
        payload: {
          employeeId: employee.id,
          userId: employee.userId,
          managerUserId: manager?.userId ?? null,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          leaveTypeId: leaveType.id,
          leaveTypeName: leaveType.name,
          days: input.days,
          startDate: input.startDate.toISOString(),
          endDate: input.endDate.toISOString(),
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return request;
    });
  }

  async listRequests(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { status?: string; employeeId?: string; mine?: boolean },
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);

    const scopedEmployees = await this.prisma.employee.findMany({
      where: { organisationId: ctx.organisationId, AND: [resolved.employeeWhere] },
      select: { id: true },
    });
    let employeeIds = scopedEmployees.map((e) => e.id);

    if (filters.mine) {
      employeeIds = resolved.actorEmployee ? [resolved.actorEmployee.id] : [];
    }

    if (filters.employeeId) {
      if (!employeeIds.includes(filters.employeeId)) {
        throw new ForbiddenException('Employee is outside your data scope');
      }
      employeeIds = [filters.employeeId];
    }

    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        organisationId: ctx.organisationId,
        employeeId: { in: employeeIds },
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: { leaveType: true },
      orderBy: { createdAt: 'desc' },
    });

    const relatedEmployeeIds = [...new Set(requests.map((r) => r.employeeId))];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: relatedEmployeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const employeeNameMap = new Map(
      employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]),
    );

    return requests.map((r) => ({
      ...r,
      employeeName: employeeNameMap.get(r.employeeId) ?? null,
      leaveTypeName: r.leaveType?.name ?? null,
    }));
  }

  async approve(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
    reviewNote?: string,
  ) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (!['pending', 'manager_approved'].includes(request.status)) {
      throw new BadRequestException(`Cannot approve a request in status ${request.status}`);
    }

    // hrms.leave.manage finalises the approval; otherwise it is a manager
    // approval that still needs an HR admin to finalise.
    const finalStatus = can(user, 'hrms.leave.manage') ? 'approved' : 'manager_approved';

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: finalStatus,
          reviewedBy: ctx.actorId,
          reviewedAt: new Date(),
          reviewNote,
        },
      });

      if (finalStatus === 'approved') {
        const year = request.startDate.getFullYear();
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year,
            },
          },
        });
        if (balance) {
          if (balance.entitled - balance.used < request.days) {
            throw new BadRequestException('Insufficient leave balance');
          }
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { used: { increment: request.days } },
          });
        }
      }

      const employee = await tx.employee.findFirst({
        where: { id: request.employeeId, organisationId: ctx.organisationId },
        select: { userId: true, firstName: true, lastName: true },
      });

      if (finalStatus === 'approved') {
        const endOfDay = new Date(request.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        await tx.calendarEvent.upsert({
          where: {
            sourceType_sourceId: {
              sourceType: 'leave-request',
              sourceId: request.id,
            },
          },
          update: {
            startAt: request.startDate,
            endAt: endOfDay,
          },
          create: {
            organisationId: ctx.organisationId,
            title: `Leave — ${employee ? `${employee.firstName} ${employee.lastName}` : 'Employee'}`,
            type: 'leave',
            startAt: request.startDate,
            endAt: endOfDay,
            allDay: true,
            visibility: 'organisation',
            employeeId: request.employeeId,
            sourceType: 'leave-request',
            sourceId: request.id,
            createdBy: ctx.actorId,
          },
        });
      }

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.leave.approved',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'leave-request',
        resourceId: id,
        payload: {
          status: finalStatus,
          employeeId: request.employeeId,
          userId: employee?.userId ?? null,
          days: request.days,
          startDate: request.startDate.toISOString(),
          endDate: request.endDate.toISOString(),
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });
  }

  async reject(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
    reviewNote?: string,
  ) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (!['pending', 'manager_approved'].includes(request.status)) {
      throw new BadRequestException(`Cannot reject a request in status ${request.status}`);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedBy: ctx.actorId,
          reviewedAt: new Date(),
          reviewNote,
        },
      });

      const employee = await tx.employee.findFirst({
        where: { id: request.employeeId, organisationId: ctx.organisationId },
        select: { userId: true },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.leave.rejected',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'leave-request',
        resourceId: id,
        payload: {
          employeeId: request.employeeId,
          userId: employee?.userId ?? null,
          days: request.days,
          startDate: request.startDate.toISOString(),
          endDate: request.endDate.toISOString(),
          reviewNote: reviewNote ?? null,
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });
  }

  async cancel(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!request) throw new NotFoundException('Leave request not found');

    const actorEmployee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (!actorEmployee || request.employeeId !== actorEmployee.id) {
      throw new ForbiddenException('Only the requester can cancel a leave request');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }
}
