import {
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

export interface RequestContextInput {
  organisationId: string;
  actorId: string;
  correlationId?: string;
}

export interface CreateEmployeeInput extends RequestContextInput {
  userId: string;
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
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map((e) => sanitizeEmployee(e, user));
  }

  async getById(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    const [resolved, employee] = await Promise.all([
      this.scope.resolve(user, ctx.organisationId),
      this.prisma.employee.findFirst({
        where: { id, organisationId: ctx.organisationId },
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

  async create(input: CreateEmployeeInput, tx?: Prisma.TransactionClient) {
    const run = async (t: Prisma.TransactionClient) => {
      const existing = await t.employee.findUnique({
        where: { organisationId_userId: { organisationId: input.organisationId, userId: input.userId } },
      });
      if (existing) return existing;

      const created = await t.employee.create({
        data: {
          organisationId: input.organisationId,
          userId: input.userId,
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
    return this.prisma.$transaction(run);
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
      // Own-profile edits are limited to a safe subset of fields.
      const requested = Object.keys(input).filter(
        (k) => (input as unknown as Record<string, unknown>)[k] !== undefined,
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

    if (Object.keys(data).length === 0) {
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
