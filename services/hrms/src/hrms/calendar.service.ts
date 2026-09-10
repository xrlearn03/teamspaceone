import { Injectable } from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import type { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { HrmsScopeService } from './scope.service.js';
import type { RequestContextInput } from './employees.service.js';

/**
 * Org calendar: aggregates CalendarEvent rows (leave, custom) with holidays.
 *
 * Visibility rules:
 * - `organisation` events are visible to every member with hrms.access.
 * - `private` events are visible to their creator and to anyone whose HRMS
 *   data scope covers the tagged employee.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: HrmsScopeService,
  ) {}

  async list(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    range: { from?: Date; to?: Date },
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);

    const scopedEmployees = await this.prisma.employee.findMany({
      where: { organisationId: ctx.organisationId, AND: [resolved.employeeWhere] },
      select: { id: true },
    });
    const scopedIds = new Set(scopedEmployees.map((e) => e.id));

    const rangeWhere: Prisma.CalendarEventWhereInput =
      range.from || range.to
        ? {
            startAt: { lte: range.to ?? new Date('2999-12-31') },
            endAt: { gte: range.from ?? new Date('1970-01-01') },
          }
        : {};

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        organisationId: ctx.organisationId,
        AND: [rangeWhere],
        OR: [
          { visibility: 'organisation' },
          { createdBy: user.id },
          { employeeId: { in: [...scopedIds] } },
        ],
      },
      orderBy: { startAt: 'asc' },
    });

    const holidayWhere: Prisma.HolidayWhereInput = {
      organisationId: ctx.organisationId,
      ...(range.from || range.to
        ? {
            date: {
              gte: range.from ?? new Date('1970-01-01'),
              lte: range.to ?? new Date('2999-12-31'),
            },
          }
        : {}),
    };
    const holidays = await this.prisma.holiday.findMany({
      where: holidayWhere,
      orderBy: { date: 'asc' },
    });

    return {
      events,
      holidays: holidays.map((h) => ({
        id: `holiday-${h.id}`,
        title: h.name,
        type: 'holiday',
        startAt: h.date,
        endAt: h.date,
        allDay: true,
        visibility: 'organisation',
      })),
    };
  }

  async create(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    input: {
      title: string;
      description?: string;
      startAt: Date;
      endAt: Date;
      allDay?: boolean;
      visibility?: string;
    },
  ) {
    // Only org-scoped HR users may create organisation-wide events; everyone
    // else creates private events.
    const visibility =
      input.visibility === 'organisation' && can(user, 'hrms.leave.manage')
        ? 'organisation'
        : 'private';

    return this.prisma.calendarEvent.create({
      data: {
        organisationId: ctx.organisationId,
        title: input.title,
        description: input.description,
        type: 'custom',
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay ?? true,
        visibility,
        createdBy: user.id,
      },
    });
  }
}
