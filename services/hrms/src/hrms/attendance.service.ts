import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
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
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });
    if (existing?.checkInAt) {
      throw new BadRequestException('Already checked in for today');
    }

    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      update: {
        checkInAt: now,
        checkOutAt: null,
        workMinutes: null,
        breakMinutes: 0,
        breakStartedAt: null,
        presenceStatus: null,
        status: 'present',
      },
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
    if (record.checkOutAt) {
      throw new BadRequestException('Already checked out for today');
    }

    const checkInAt = record.checkInAt;
    const activeBreakMinutes = record.breakStartedAt
      ? Math.max(0, Math.round((now.getTime() - record.breakStartedAt.getTime()) / 60000))
      : 0;
    const breakMinutes = record.breakMinutes + activeBreakMinutes;
    const workMinutes = Math.max(
      0,
      Math.round((now.getTime() - checkInAt.getTime()) / 60000) - breakMinutes,
    );

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          checkOutAt: now,
          workMinutes,
          breakMinutes,
          breakStartedAt: null,
          presenceStatus: null,
        },
      });
      const envelope = createEventEnvelope({
        eventType: Subjects.HRMS_ATTENDANCE_CHECKED_OUT,
        organisationId: ctx.organisationId,
        actorId: user.id,
        correlationId: ctx.correlationId,
        resourceType: 'attendance-record',
        resourceId: record.id,
        payload: {
          attendanceRecordId: record.id,
          userId: user.id,
          date: record.date.toISOString(),
          checkInAt: checkInAt.toISOString(),
          checkOutAt: now.toISOString(),
          workMinutes,
          breakMinutes,
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);
      return updated;
    });
  }

  async setPresenceStatus(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    status: 'lunch' | 'tea_break' | 'out_of_office' | null,
  ) {
    const employee = await this.requireActorEmployee(ctx, user);
    const today = startOfDay(new Date());

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });
    if (!record || !record.checkInAt) {
      throw new BadRequestException('Check in before setting a status');
    }
    if (record.checkOutAt) {
      throw new BadRequestException('Already checked out for today');
    }

    const now = new Date();
    const wasOnBreak = record.presenceStatus != null;
    const isStartingBreak = status != null && !wasOnBreak;
    const isEndingBreak = status == null && wasOnBreak;
    const completedBreakMinutes = isEndingBreak && record.breakStartedAt
      ? Math.max(0, Math.round((now.getTime() - record.breakStartedAt.getTime()) / 60000))
      : 0;

    return this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        presenceStatus: status,
        breakStartedAt: isStartingBreak ? now : isEndingBreak ? null : record.breakStartedAt,
        breakMinutes: { increment: completedBreakMinutes },
      },
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
    const requestedCheckInAt = input.requestedCheckInAt ?? record.checkInAt;
    const requestedCheckOutAt = input.requestedCheckOutAt ?? record.checkOutAt;
    if (requestedCheckInAt && requestedCheckOutAt && requestedCheckOutAt <= requestedCheckInAt) {
      throw new BadRequestException('Check-out must be after check-in');
    }

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

  async listCorrections(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { status?: string } = {},
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);

    const scopedEmployees = await this.prisma.employee.findMany({
      where: { organisationId: ctx.organisationId, AND: [resolved.employeeWhere] },
      select: { id: true },
    });
    const employeeIds = scopedEmployees.map((e) => e.id);

    const where: Prisma.AttendanceCorrectionWhereInput = {
      organisationId: ctx.organisationId,
      employeeId: { in: employeeIds },
    };
    if (filters.status) {
      where.status = filters.status;
    }

    const corrections = await this.prisma.attendanceCorrection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const relatedEmployeeIds = [...new Set(corrections.map((c) => c.employeeId))];
    const attendanceIds = [...new Set(corrections.map((c) => c.attendanceId))];

    const [employees, records] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: relatedEmployeeIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { id: { in: attendanceIds } },
        select: { id: true, date: true },
      }),
    ]);

    const employeeNameMap = new Map(
      employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]),
    );
    const dateMap = new Map(records.map((r) => [r.id, r.date]));

    return corrections.map((c) => ({
      ...c,
      employeeName: employeeNameMap.get(c.employeeId) ?? null,
      date: dateMap.get(c.attendanceId)?.toISOString() ?? null,
    }));
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
        const record = await tx.attendanceRecord.findUnique({
          where: { id: correction.attendanceId },
        });
        if (!record) throw new NotFoundException('Attendance record not found');
        const checkInAt = correction.requestedCheckInAt ?? record.checkInAt;
        const checkOutAt = correction.requestedCheckOutAt ?? record.checkOutAt;
        if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
          throw new BadRequestException('Check-out must be after check-in');
        }
        const workMinutes = checkInAt && checkOutAt
          ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000))
          : null;
        await tx.attendanceRecord.update({
          where: { id: correction.attendanceId },
          data: { checkInAt, checkOutAt, workMinutes },
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
