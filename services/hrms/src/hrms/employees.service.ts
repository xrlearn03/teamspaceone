import {
  BadRequestException,
  ConflictException,
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
import { AuthProfileClientService, type AuthProfileUpdate } from './auth-profile.client.js';
import { AuthAccountsClientService } from './auth-accounts.client.js';

export interface RequestContextInput {
  organisationId: string;
  actorId: string;
  correlationId?: string;
}

export interface CreateEmployeeInput extends RequestContextInput {
  userId?: string;
  membershipId?: string;
  employeeNumber?: string;
  firstName: string;
  lastName: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  avatarFileId?: string;
  departmentId?: string;
  designationId?: string;
  managerEmployeeId?: string;
  joiningDate?: Date;
  employmentType?: string;
  dateOfBirth?: Date;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  salary?: unknown;
}

export interface UpdateEmployeeInput extends RequestContextInput {
  userId?: string | null;
  membershipId?: string | null;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  avatarFileId?: string;
  departmentId?: string;
  designationId?: string;
  managerEmployeeId?: string;
  joiningDate?: Date;
  employmentType?: string;
  status?: string;
  dateOfBirth?: Date;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  salary?: unknown;
}

const TRACKED_FIELDS = [
  'userId',
  'membershipId',
  'employeeNumber',
  'firstName',
  'lastName',
  'workEmail',
  'personalEmail',
  'phone',
  'avatarFileId',
  'departmentId',
  'designationId',
  'managerEmployeeId',
  'joiningDate',
  'employmentType',
  'status',
  'dateOfBirth',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'salary',
] as const;

/** Keys present on every service input that are not employee fields. */
const REQUEST_CONTEXT_KEYS = new Set(['organisationId', 'actorId', 'correlationId']);

/** Fields a user may change on their own profile without hrms.employee.edit. */
const SELF_EDITABLE_FIELDS = new Set([
  'personalEmail',
  'phone',
  'avatarFileId',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
]);

/** Strip the restricted salary field unless the user may view payroll. */
export function sanitizeEmployee<T extends { salary?: unknown }>(
  employee: T,
  user: AuthorizableUser,
): T {
  if (can(user, 'hrms.payroll.view')) return employee;
  const { salary: _salary, ...rest } = employee;
  return rest as T;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scope: HrmsScopeService,
    private readonly authProfiles: AuthProfileClientService,
    private readonly authAccounts: AuthAccountsClientService,
  ) {}

  async list(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { departmentId?: string; status?: string; search?: string },
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const andConditions: Prisma.EmployeeWhereInput[] = [resolved.employeeWhere];
    const where: Prisma.EmployeeWhereInput = {
      organisationId: ctx.organisationId,
      AND: andConditions,
    };
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      andConditions.push({
        OR: [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { workEmail: { contains: filters.search, mode: 'insensitive' } },
          { employeeNumber: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    const employees = await this.prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map((e) => sanitizeEmployee(e, user));
  }

  async getById(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    const [resolved, employee] = await Promise.all([
      this.scope.resolve(user, ctx.organisationId),
      this.prisma.employee.findFirst({
        where: { id, organisationId: ctx.organisationId },
        include: {
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, title: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!this.scope.canSeeEmployee(resolved, employee)) {
      throw new ForbiddenException('Employee is outside your data scope');
    }
    return sanitizeEmployee(employee, user);
  }

  async getMe(ctx: RequestContextInput, user: AuthorizableUser) {
    const actorEmployee = await this.scope.getActorEmployee(
      ctx.organisationId,
      user.id,
    );
    if (!actorEmployee) throw new NotFoundException('No employee record for current user');
    return sanitizeEmployee(actorEmployee, user);
  }

  /**
   * Upcoming birthdays within `days`. Deliberately NOT data-scope filtered:
   * birthdays are org-directory information, and only non-sensitive fields
   * (name, department, day/month — never the birth year) are returned.
   */
  async listBirthdays(ctx: RequestContextInput, days = 7) {
    const windowDays = Math.min(Math.max(Math.floor(days) || 7, 1), 62);
    const employees = await this.prisma.employee.findMany({
      where: {
        organisationId: ctx.organisationId,
        dateOfBirth: { not: null },
        status: 'active',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarFileId: true,
        dateOfBirth: true,
        department: { select: { name: true } },
      },
    });

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = employees
      .map((e) => {
        const dob = e.dateOfBirth as Date;
        let next = new Date(start.getFullYear(), dob.getMonth(), dob.getDate());
        if (next.getTime() < start.getTime()) {
          next = new Date(start.getFullYear() + 1, dob.getMonth(), dob.getDate());
        }
        const daysUntil = Math.round((next.getTime() - start.getTime()) / 86400000);
        return {
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          avatarFileId: e.avatarFileId,
          departmentName: e.department?.name ?? null,
          date: next.toISOString().slice(0, 10),
          daysUntil,
        };
      })
      .filter((e) => e.daysUntil <= windowDays)
      .sort((a, b) => a.daysUntil - b.daysUntil || a.firstName.localeCompare(b.firstName));
    return upcoming;
  }

  async syncProfile(
    employee: { userId: string | null; firstName: string; lastName: string; avatarFileId?: string | null },
    correlationId?: string,
  ) {
    if (!employee.userId) return;
    await this.authProfiles.updateUserProfile(
      employee.userId,
      {
        firstName: employee.firstName,
        lastName: employee.lastName,
        avatarFileId: employee.avatarFileId ?? null,
      },
      correlationId,
    );
  }

  async create(input: CreateEmployeeInput, tx?: Prisma.TransactionClient) {
    const run = async (t: Prisma.TransactionClient) => {
      if (input.userId) {
        const existing = await t.employee.findUnique({
          where: { organisationId_userId: { organisationId: input.organisationId, userId: input.userId } },
        });
        if (existing) return existing;
      }

      const created = await t.employee.create({
        data: {
          organisationId: input.organisationId,
          userId: input.userId ?? null,
          membershipId: input.membershipId,
          employeeNumber: input.employeeNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          workEmail: input.workEmail,
          personalEmail: input.personalEmail,
          phone: input.phone,
          avatarFileId: input.avatarFileId,
          departmentId: input.departmentId,
          designationId: input.designationId,
          managerEmployeeId: input.managerEmployeeId,
          joiningDate: input.joiningDate,
          employmentType: input.employmentType ?? 'full_time',
          dateOfBirth: input.dateOfBirth,
          address: input.address,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          salary: (input.salary ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      await t.employeeHistory.create({
        data: {
          organisationId: input.organisationId,
          employeeId: created.id,
          changeType: 'created',
          changedBy: input.actorId,
        },
      });

      const finalEnvelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.employee.created',
        organisationId: input.organisationId,
        actorId: input.actorId,
        correlationId: input.correlationId,
        resourceType: 'employee',
        resourceId: created.id,
        payload: {
          userId: created.userId,
          firstName: created.firstName,
          lastName: created.lastName,
          departmentId: created.departmentId,
        },
      });
      await this.outbox.createEvent(t, finalEnvelope, finalEnvelope.eventType);

      return created;
    };

    if (tx) return run(tx);
    const employee = await this.prisma.$transaction(run);
    await this.syncProfile(employee, input.correlationId);
    return employee;
  }

  async update(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
    input: UpdateEmployeeInput,
  ) {
    const [resolved, existing] = await Promise.all([
      this.scope.resolve(user, ctx.organisationId),
      this.prisma.employee.findFirst({
        where: { id, organisationId: ctx.organisationId },
      }),
    ]);
    if (!existing) throw new NotFoundException('Employee not found');

    const isSelf = resolved.actorEmployee?.id === existing.id;
    const canEdit = can(user, 'hrms.employee.edit');

    if (!canEdit) {
      if (!isSelf) {
        throw new ForbiddenException('You may only edit your own profile');
      }
      // Own-profile edits are limited to a safe subset of fields. Request
      // context keys (organisationId/actorId/correlationId) are not fields.
      const requested = Object.keys(input).filter(
        (k) =>
          (input as unknown as Record<string, unknown>)[k] !== undefined &&
          !REQUEST_CONTEXT_KEYS.has(k),
      );
      const disallowed = requested.filter((k) => !SELF_EDITABLE_FIELDS.has(k));
      if (disallowed.length > 0) {
        throw new ForbiddenException(
          `Field(s) not editable on own profile: ${disallowed.join(', ')}`,
        );
      }
    } else if (!this.scope.canSeeEmployee(resolved, existing) && !isSelf) {
      throw new ForbiddenException('Employee is outside your data scope');
    }

    const data: Record<string, unknown> = {};
    const history: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
    for (const field of TRACKED_FIELDS) {
      const newValue = (input as unknown as Record<string, unknown>)[field];
      if (newValue === undefined) continue;
      const oldValue = (existing as unknown as Record<string, unknown>)[field];
      const oldSerialized = oldValue instanceof Date ? oldValue.toISOString() : serialize(oldValue);
      const newSerialized = newValue instanceof Date ? newValue.toISOString() : serialize(newValue);
      if (oldSerialized === newSerialized) continue;
      data[field] = newValue;
      history.push({ field, oldValue: oldSerialized, newValue: newSerialized });
    }

    if (typeof data.userId === 'string' && data.userId) {
      const linked = await this.prisma.employee.findFirst({
        where: {
          organisationId: ctx.organisationId,
          userId: data.userId,
          id: { not: id },
        },
        select: { id: true },
      });
      if (linked) {
        throw new ConflictException('Another employee record is already linked to this user');
      }
    }

    if (Object.keys(data).length === 0) {
      if (!existing.userId) return sanitizeEmployee(existing, user);
      await this.authProfiles.updateUserProfile(
        existing.userId,
        {
          firstName: existing.firstName,
          lastName: existing.lastName,
          avatarFileId: existing.avatarFileId,
        },
        ctx.correlationId,
      );
      return sanitizeEmployee(existing, user);
    }

    const employee = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.employee.update({ where: { id }, data: data as Prisma.EmployeeUpdateInput });

      await tx.employeeHistory.createMany({
        data: history.map((h) => ({
          organisationId: ctx.organisationId,
          employeeId: id,
          changeType: 'updated',
          field: h.field,
          oldValue: h.oldValue,
          newValue: h.newValue,
          changedBy: ctx.actorId,
        })),
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.employee.updated',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'employee',
        resourceId: id,
        payload: { changedFields: history.map((h) => h.field) },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });

    const profile: AuthProfileUpdate = {};
    if ('firstName' in data) profile.firstName = employee.firstName;
    if ('lastName' in data) profile.lastName = employee.lastName;
    if ('avatarFileId' in data) profile.avatarFileId = employee.avatarFileId;
    if (Object.keys(profile).length > 0 && employee.userId) {
      await this.authProfiles.updateUserProfile(employee.userId, profile, ctx.correlationId);
    }

    return sanitizeEmployee(employee, user);
  }

  /**
   * HR-driven invite: provisions a login account in the auth service
   * (temporary password for new accounts; unactivated accounts get theirs
   * rotated), links it to the employee record, and emits
   * `hrms.employee.invited` so the organisation service can grant the default
   * membership and the notification service emails the credentials — the same
   * email admins' member invites produce.
   */
  async invite(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
    input: { email?: string },
  ) {
    const [resolved, existing] = await Promise.all([
      this.scope.resolve(user, ctx.organisationId),
      this.prisma.employee.findFirst({
        where: { id, organisationId: ctx.organisationId },
      }),
    ]);
    if (!existing) throw new NotFoundException('Employee not found');
    const isSelf = resolved.actorEmployee?.id === existing.id;
    if (!this.scope.canSeeEmployee(resolved, existing) && !isSelf) {
      throw new ForbiddenException('Employee is outside your data scope');
    }
    if (existing.userId) {
      throw new ConflictException('Employee already has a login account');
    }
    if (existing.status === 'terminated') {
      throw new BadRequestException('Cannot invite a terminated employee');
    }

    const email = (input.email ?? existing.workEmail ?? existing.personalEmail ?? '')
      .trim()
      .toLowerCase();
    if (!email) {
      throw new BadRequestException('Employee has no email on file — provide one to send the invite');
    }

    const provisioned = await this.authAccounts.provisionUser(
      { email, firstName: existing.firstName, lastName: existing.lastName },
      ctx.correlationId,
    );
    let temporaryPassword = provisioned.temporaryPassword ?? undefined;
    if (!temporaryPassword) {
      temporaryPassword =
        (await this.authAccounts.resetTemporaryPassword(provisioned.user.id, ctx.correlationId)) ??
        undefined;
    }

    const employee = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.employee.update({
        where: { id },
        data: {
          userId: provisioned.user.id,
          ...(existing.workEmail ? {} : { workEmail: email }),
        },
      });

      await tx.employeeHistory.create({
        data: {
          organisationId: ctx.organisationId,
          employeeId: id,
          changeType: 'invited',
          field: 'userId',
          oldValue: null,
          newValue: provisioned.user.id,
          changedBy: ctx.actorId,
        },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.employee.invited',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'employee',
        resourceId: id,
        payload: {
          employeeId: id,
          userId: provisioned.user.id,
          email,
          firstName: existing.firstName,
          lastName: existing.lastName,
          temporaryPassword,
          accountCreated: provisioned.accountCreated,
          invitedBy: ctx.actorId,
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });

    await this.syncProfile(employee, ctx.correlationId);
    return sanitizeEmployee(employee, user);
  }

  async terminate(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    const existing = await this.prisma.employee.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!existing) throw new NotFoundException('Employee not found');

    const employee = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { status: 'terminated' },
      });

      await tx.employeeHistory.create({
        data: {
          organisationId: ctx.organisationId,
          employeeId: id,
          changeType: 'terminated',
          field: 'status',
          oldValue: existing.status,
          newValue: 'terminated',
          changedBy: ctx.actorId,
        },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.employee.terminated',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'employee',
        resourceId: id,
        payload: { userId: existing.userId },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });

    return sanitizeEmployee(employee, user);
  }
}

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
