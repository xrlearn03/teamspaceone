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

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scope: HrmsScopeService,
  ) {}

  private async requireActorEmployee(ctx: RequestContextInput, user: AuthorizableUser) {
    const employee = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (!employee) {
      throw new NotFoundException('No employee record for current user');
    }
    return employee;
  }

  async checkIn(ctx: RequestContextInput, user: AuthorizableUser) {
    const employee = await this.requireActorEmployee(ctx, user);
    const today = startOfDay(new Date());
    const now = new Date();

    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      update: { checkInAt: now, status: 'present' },
      create: {
        organisationId: ctx.organisationId,
        employeeId: employee.id,
        date: today,
        checkInAt: now,
        status: 'present',
      },
    });
  }

  async checkOut(ctx: RequestContextInput, user: AuthorizableUser) {
    const employee = await this.requireActorEmployee(ctx, user);
    const today = startOfDay(new Date());
    const now = new Date();

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });
    if (!record || !record.checkInAt) {
      throw new BadRequestException('No check-in found for today');
    }

    const workMinutes = Math.max(
      0,
      Math.round((now.getTime() - record.checkInAt.getTime()) / 60000),
    );

    return this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { checkOutAt: now, workMinutes },
    });
  }

  async list(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { employeeId?: string; from?: Date; to?: Date },
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);

    // Restrict to employees visible inside the caller's scope.
    const scopedEmployees = await this.prisma.employee.findMany({
      where: { organisationId: ctx.organisationId, AND: [resolved.employeeWhere] },
      select: { id: true },
    });
    let employeeIds = scopedEmployees.map((e) => e.id);

    if (filters.employeeId) {
      if (!employeeIds.includes(filters.employeeId)) {
        throw new ForbiddenException('Employee is outside your data scope');
      }
      employeeIds = [filters.employeeId];
    }

    const where: Prisma.AttendanceRecordWhereInput = {
      organisationId: ctx.organisationId,
      employeeId: { in: employeeIds },
    };
    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) where.date.gte = filters.from;
      if (filters.to) where.date.lte = filters.to;
    }

    return this.prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
    });
  }

  async requestCorrection(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    input: {
      attendanceId: string;
      requestedCheckInAt?: Date;
      requestedCheckOutAt?: Date;
      reason: string;
    },
  ) {
    const employee = await this.requireActorEmployee(ctx, user);

    const record = await this.prisma.attendanceRecord.findFirst({
      where: {
        id: input.attendanceId,
        organisationId: ctx.organisationId,
        employeeId: employee.id,
      },
    });
    if (!record) throw new NotFoundException('Attendance record not found');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const correction = await tx.attendanceCorrection.create({
        data: {
          organisationId: ctx.organisationId,
          attendanceId: record.id,
          employeeId: employee.id,
          requestedCheckInAt: input.requestedCheckInAt,
          requestedCheckOutAt: input.requestedCheckOutAt,
          reason: input.reason,
        },
      });

      const manager = employee.managerEmployeeId
        ? await tx.employee.findFirst({
            where: { id: employee.managerEmployeeId, organisationId: ctx.organisationId },
            select: { userId: true },
          })
        : null;

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.attendance.correction.requested',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'attendance-correction',
        resourceId: correction.id,
        payload: {
          attendanceId: record.id,
          employeeId: employee.id,
          userId: employee.userId,
          managerUserId: manager?.userId ?? null,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          date: record.date.toISOString(),
          reason: input.reason,
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return correction;
    });
  }

  /**
   * Reviewer must hold hrms.attendance.approve AND either be the manager of
   * the requesting employee or have organisation-level HR scope.
   */
  private async assertCanReview(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    correction: { employeeId: string; status: string },
  ) {
    if (!can(user, 'hrms.attendance.approve')) {
      throw new ForbiddenException('Missing hrms.attendance.approve');
    }
    if (correction.status !== 'pending') {
      throw new BadRequestException('Correction already reviewed');
    }

    const resolved = await this.scope.resolve(user, ctx.organisationId);
    if (resolved.level === 'organisation') return;

    const requester = await this.prisma.employee.findFirst({
      where: { id: correction.employeeId, organisationId: ctx.organisationId },
      select: { managerEmployeeId: true },
    });
    if (!requester || requester.managerEmployeeId !== resolved.actorEmployee?.id) {
      throw new ForbiddenException(
        'Only the employee manager or an HR admin can review corrections',
      );
    }
  }

  async reviewCorrection(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
    action: 'approved' | 'rejected',
    reviewNote?: string,
  ) {
    const correction = await this.prisma.attendanceCorrection.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!correction) throw new NotFoundException('Correction not found');

    await this.assertCanReview(ctx, user, correction);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.attendanceCorrection.update({
        where: { id },
        data: {
          status: action,
          reviewedBy: ctx.actorId,
          reviewedAt: new Date(),
          reviewNote,
        },
      });

      if (action === 'approved') {
        await tx.attendanceRecord.update({
          where: { id: correction.attendanceId },
          data: {
            checkInAt: correction.requestedCheckInAt ?? undefined,
            checkOutAt: correction.requestedCheckOutAt ?? undefined,
          },
        });
      }

      const employee = await tx.employee.findFirst({
        where: { id: correction.employeeId, organisationId: ctx.organisationId },
        select: { userId: true },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.attendance.correction.resolved',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'attendance-correction',
        resourceId: id,
        payload: {
          status: action,
          employeeId: correction.employeeId,
          userId: employee?.userId ?? null,
          reviewNote: reviewNote ?? null,
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });
  }
}
