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
import {
  EmployeesService,
  type RequestContextInput,
  type CreateEmployeeInput,
} from './employees.service.js';

interface TemplateTaskInput {
  title: string;
  description?: string;
  category?: string;
  assigneeRole?: string;
  dueDaysOffset?: number;
  sortOrder?: number;
}

interface TemplateInput {
  name: string;
  description?: string;
  isActive?: boolean;
  tasks: TemplateTaskInput[];
}

interface OnboardingStartInput {
  employeeId?: string;
  candidateName?: string;
  candidateEmail?: string;
  templateId?: string;
  startDate?: Date;
}

interface HireInput {
  candidateName: string;
  candidateEmail?: string;
  sourceId: string;
  jobTitle?: string;
}

interface OffboardingInitiateInput {
  employeeId: string;
  type: string;
  reason?: string;
  lastWorkingDate?: Date;
}

const DEFAULT_ONBOARDING_TASKS: TemplateTaskInput[] = [
  { title: 'Set up accounts', category: 'accounts', dueDaysOffset: 0, sortOrder: 0 },
  { title: 'Collect documents', category: 'documents', dueDaysOffset: 1, sortOrder: 1 },
  { title: 'Provision workspace access', category: 'access', dueDaysOffset: 0, sortOrder: 2 },
  { title: 'Intro meeting with manager', category: 'meetings', dueDaysOffset: 1, sortOrder: 3 },
  { title: 'Issue equipment', category: 'equipment', dueDaysOffset: 2, sortOrder: 4 },
  { title: '30-day check-in', category: 'review', dueDaysOffset: 30, sortOrder: 5 },
];

const DEFAULT_OFFBOARDING_TASKS = [
  { title: 'Revoke system access', category: 'access', sortOrder: 0 },
  { title: 'Collect company assets', category: 'assets', sortOrder: 1 },
  { title: 'Schedule exit interview', category: 'exit_interview', sortOrder: 2 },
  { title: 'Process final settlement', category: 'settlement', sortOrder: 3 },
];

@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scope: HrmsScopeService,
    private readonly employees: EmployeesService,
  ) {}

  /* ───────────── Onboarding Templates ───────────── */

  listTemplates(organisationId: string) {
    return this.prisma.onboardingTemplate.findMany({
      where: { organisationId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(organisationId: string, input: TemplateInput) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const template = await tx.onboardingTemplate.create({
        data: {
          organisationId,
          name: input.name,
          description: input.description,
          isActive: input.isActive ?? true,
        },
      });

      const tasks = input.tasks.length
        ? input.tasks
        : DEFAULT_ONBOARDING_TASKS;

      await tx.onboardingTemplateTask.createMany({
        data: tasks.map((t) => ({
          organisationId,
          templateId: template.id,
          title: t.title,
          description: t.description,
          category: t.category,
          assigneeRole: t.assigneeRole,
          dueDaysOffset: t.dueDaysOffset ?? 0,
          sortOrder: t.sortOrder ?? 0,
        })),
      });

      return tx.onboardingTemplate.findFirst({
        where: { id: template.id },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async updateTemplate(organisationId: string, id: string, input: Partial<TemplateInput>) {
    const template = await this.prisma.onboardingTemplate.findFirst({
      where: { id, organisationId },
    });
    if (!template) throw new NotFoundException('Onboarding template not found');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const data: Prisma.OnboardingTemplateUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      await tx.onboardingTemplate.update({ where: { id }, data });

      if (input.tasks !== undefined) {
        await tx.onboardingTemplateTask.deleteMany({ where: { templateId: id } });
        const tasks = input.tasks.length ? input.tasks : DEFAULT_ONBOARDING_TASKS;
        await tx.onboardingTemplateTask.createMany({
          data: tasks.map((t) => ({
            organisationId,
            templateId: id,
            title: t.title,
            description: t.description,
            category: t.category,
            assigneeRole: t.assigneeRole,
            dueDaysOffset: t.dueDaysOffset ?? 0,
            sortOrder: t.sortOrder ?? 0,
          })),
        });
      }

      return tx.onboardingTemplate.findFirst({
        where: { id },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async deleteTemplate(organisationId: string, id: string) {
    const template = await this.prisma.onboardingTemplate.findFirst({
      where: { id, organisationId },
    });
    if (!template) throw new NotFoundException('Onboarding template not found');
    await this.prisma.onboardingTemplate.delete({ where: { id } });
  }

  /* ───────────── Onboarding Instances ───────────── */

  async listInstances(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { status?: string } = {},
  ) {
    const canManage = can(user, 'hrms.onboarding.manage');

    let where: Prisma.OnboardingInstanceWhereInput = {
      organisationId: ctx.organisationId,
      ...(filters.status ? { status: filters.status } : {}),
    };

    if (!canManage) {
      const actor = await this.scope.getActorEmployee(ctx.organisationId, user.id);
      const ownWhere: Prisma.OnboardingInstanceWhereInput = actor
        ? { OR: [{ employeeId: actor.id }, { tasks: { some: { assigneeUserId: user.id } } }] }
        : { tasks: { some: { assigneeUserId: user.id } } };
      where = { AND: [where, ownWhere] } as Prisma.OnboardingInstanceWhereInput;
    }

    return this.prisma.onboardingInstance.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, userId: true } },
        template: { select: { id: true, name: true } },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInstance(ctx: RequestContextInput, id: string) {
    const instance = await this.prisma.onboardingInstance.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, userId: true } },
        template: true,
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!instance) throw new NotFoundException('Onboarding instance not found');
    return instance;
  }

  async startOnboarding(ctx: RequestContextInput, input: OnboardingStartInput) {
    const template = input.templateId
      ? await this.prisma.onboardingTemplate.findFirst({
          where: { id: input.templateId, organisationId: ctx.organisationId },
          include: { tasks: { orderBy: { sortOrder: 'asc' } } },
        })
      : null;

    const startDate = input.startDate ?? new Date();

    const instanceId = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const instance = await tx.onboardingInstance.create({
        data: {
          organisationId: ctx.organisationId,
          employeeId: input.employeeId,
          templateId: input.templateId,
          candidateName: input.candidateName,
          candidateEmail: input.candidateEmail,
          sourceType: input.employeeId ? 'employee' : 'interview',
          status: 'in_progress',
          startDate,
          createdBy: ctx.actorId,
        },
        include: { employee: { select: { userId: true } } },
      });

      const taskDefinitions = template?.tasks.length
        ? template.tasks
        : DEFAULT_ONBOARDING_TASKS;

      await tx.onboardingTask.createMany({
        data: taskDefinitions.map((t) => {
          const dueDate = new Date(startDate.getTime() + (t.dueDaysOffset ?? 0) * 86_400_000);
          return {
            organisationId: ctx.organisationId,
            instanceId: instance.id,
            title: t.title,
            description: t.description,
            category: t.category,
            assigneeUserId: undefined,
            dueDate,
            sortOrder: t.sortOrder ?? 0,
          };
        }),
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.onboarding.started',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'onboarding-instance',
        resourceId: instance.id,
        payload: {
          employeeId: input.employeeId ?? null,
          candidateName: input.candidateName ?? null,
          templateId: input.templateId ?? null,
        },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return instance.id;
    });

    return this.getInstance(ctx, instanceId);
  }

  async createPendingFromHire(
    organisationId: string,
    input: HireInput,
    tx: Prisma.TransactionClient,
    actorId?: string,
  ) {
    const existing = await tx.onboardingInstance.findFirst({
      where: { organisationId, sourceId: input.sourceId },
    });
    if (existing) return existing;

    const instance = await tx.onboardingInstance.create({
      data: {
        organisationId,
        candidateName: input.candidateName,
        candidateEmail: input.candidateEmail,
        sourceType: 'interview',
        sourceId: input.sourceId,
        status: 'pending',
      },
    });

    const envelope = createEventEnvelope({
      eventType: Subjects.HRMS_ONBOARDING_PENDING,
      organisationId,
      actorId,
      resourceType: 'onboarding-instance',
      resourceId: instance.id,
      payload: {
        instanceId: instance.id,
        candidateName: input.candidateName,
        candidateEmail: input.candidateEmail ?? null,
        jobTitle: input.jobTitle ?? null,
        applicationId: input.sourceId,
      },
    });
    await this.outbox.createEvent(tx, envelope, Subjects.HRMS_ONBOARDING_PENDING);

    return instance;
  }

  /**
   * Auto-provisioning hook for `teamspace-one.hrms.employee.created`: starts
   * onboarding from the organisation's default active template when one is
   * configured and no active instance already exists for the employee
   * (e.g. a converted interview hire already has an in-progress instance).
   */
  async autoStartForEmployee(organisationId: string, employeeId: string, actorId?: string) {
    const [template, existing] = await Promise.all([
      this.prisma.onboardingTemplate.findFirst({
        where: { organisationId, isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.onboardingInstance.findFirst({
        where: {
          organisationId,
          employeeId,
          status: { in: ['pending', 'in_progress'] },
        },
      }),
    ]);
    if (!template || existing) return existing;

    return this.startOnboarding(
      { organisationId, actorId: actorId ?? 'system' },
      { employeeId, templateId: template.id },
    );
  }

  async convertToEmployee(ctx: RequestContextInput, user: AuthorizableUser, id: string, input: CreateEmployeeInput) {
    const instance = await this.prisma.onboardingInstance.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!instance) throw new NotFoundException('Onboarding instance not found');
    if (instance.status !== 'pending') {
      throw new BadRequestException('Instance is not in pending status');
    }

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const employee = await this.employees.create({
        ...input,
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
      }, tx);

      await tx.onboardingInstance.update({
        where: { id },
        data: {
          employeeId: employee.id,
          status: 'in_progress',
          startDate: new Date(),
        },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.onboarding.started',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'onboarding-instance',
        resourceId: id,
        payload: { employeeId: employee.id, sourceId: instance.sourceId ?? null },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return { ...instance, employeeId: employee.id, status: 'in_progress', employee };
    });
    await this.employees.syncProfile(result.employee, ctx.correlationId);
    return result;
  }

  private async canModifyOnboardingTask(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    instance: { employeeId?: string | null; tasks?: unknown },
    task: { assigneeUserId?: string | null },
  ) {
    if (can(user, 'hrms.onboarding.manage')) return true;
    if (task.assigneeUserId === user.id) return true;
    const actor = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (actor && instance.employeeId === actor.id) return true;
    return false;
  }

  async completeTask(ctx: RequestContextInput, user: AuthorizableUser, instanceId: string, taskId: string) {
    const instance = await this.getInstance(ctx, instanceId);
    const task = instance.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException('Onboarding task not found');

    if (!(await this.canModifyOnboardingTask(ctx, user, instance, task))) {
      throw new ForbiddenException('You cannot update this task');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedTask = await tx.onboardingTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          completedBy: ctx.actorId,
        },
      });

      const remaining = await tx.onboardingTask.count({
        where: { instanceId, status: 'pending' },
      });

      if (remaining === 0) {
        await tx.onboardingInstance.update({
          where: { id: instanceId },
          data: { status: 'completed', completedAt: new Date() },
        });

        const envelope = createEventEnvelope({
          eventType: 'teamspace-one.hrms.onboarding.completed',
          organisationId: ctx.organisationId,
          actorId: ctx.actorId,
          correlationId: ctx.correlationId,
          resourceType: 'onboarding-instance',
          resourceId: instanceId,
          payload: { employeeId: instance.employeeId ?? null },
        });
        await this.outbox.createEvent(tx, envelope, envelope.eventType);
      }

      return updatedTask;
    });
  }

  async reopenTask(ctx: RequestContextInput, user: AuthorizableUser, instanceId: string, taskId: string) {
    const instance = await this.getInstance(ctx, instanceId);
    const task = instance.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException('Onboarding task not found');

    if (!(await this.canModifyOnboardingTask(ctx, user, instance, task))) {
      throw new ForbiddenException('You cannot update this task');
    }

    return this.prisma.onboardingTask.update({
      where: { id: taskId },
      data: {
        status: 'pending',
        completedAt: null,
        completedBy: null,
      },
    });
  }

  async cancelOnboarding(ctx: RequestContextInput, id: string) {
    const instance = await this.getInstance(ctx, id);
    if (['completed', 'cancelled'].includes(instance.status)) {
      throw new BadRequestException(`Cannot cancel a ${instance.status} onboarding`);
    }
    return this.prisma.onboardingInstance.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  /* ───────────── Offboarding ───────────── */

  async listCases(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { status?: string } = {},
  ) {
    const canManage = can(user, 'hrms.offboarding.manage');
    let where: Prisma.OffboardingCaseWhereInput = {
      organisationId: ctx.organisationId,
      ...(filters.status ? { status: filters.status } : {}),
    };

    if (!canManage) {
      const actor = await this.scope.getActorEmployee(ctx.organisationId, user.id);
      const ownWhere = actor
        ? { employeeId: actor.id }
        : { id: '__no_scope__' };
      where = { AND: [where, ownWhere] } as Prisma.OffboardingCaseWhereInput;
    }

    return this.prisma.offboardingCase.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, userId: true } }, tasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCase(ctx: RequestContextInput, id: string) {
    const case_ = await this.prisma.offboardingCase.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, userId: true } },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!case_) throw new NotFoundException('Offboarding case not found');
    return case_;
  }

  async initiate(ctx: RequestContextInput, input: OffboardingInitiateInput) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, organisationId: ctx.organisationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const caseId = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const case_ = await tx.offboardingCase.create({
        data: {
          organisationId: ctx.organisationId,
          employeeId: input.employeeId,
          type: input.type,
          reason: input.reason,
          lastWorkingDate: input.lastWorkingDate,
          initiatedBy: ctx.actorId,
        },
      });

      await tx.offboardingTask.createMany({
        data: DEFAULT_OFFBOARDING_TASKS.map((t) => ({
          organisationId: ctx.organisationId,
          caseId: case_.id,
          title: t.title,
          category: t.category,
          sortOrder: t.sortOrder,
        })),
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.offboarding.initiated',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'offboarding-case',
        resourceId: case_.id,
        payload: { employeeId: input.employeeId, type: input.type },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return case_.id;
    });

    return this.getCase(ctx, caseId);
  }

  async updateCase(
    ctx: RequestContextInput,
    id: string,
    input: { reason?: string; lastWorkingDate?: Date; exitInterviewNotes?: string; settlementNotes?: string; status?: string },
  ) {
    const case_ = await this.getCase(ctx, id);
    if (case_.status === 'completed' || case_.status === 'cancelled') {
      throw new BadRequestException('Cannot update a completed/cancelled offboarding case');
    }

    const data: Prisma.OffboardingCaseUpdateInput = {};
    if (input.reason !== undefined) data.reason = input.reason;
    if (input.lastWorkingDate !== undefined) data.lastWorkingDate = input.lastWorkingDate;
    if (input.exitInterviewNotes !== undefined) data.exitInterviewNotes = input.exitInterviewNotes;
    if (input.settlementNotes !== undefined) data.settlementNotes = input.settlementNotes;
    if (input.status !== undefined) data.status = input.status;

    return this.prisma.offboardingCase.update({
      where: { id },
      data,
      include: { employee: true, tasks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  private async canModifyOffboardingTask(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    case_: { employeeId: string },
    task: { assigneeUserId?: string | null },
  ) {
    if (can(user, 'hrms.offboarding.manage')) return true;
    if (task.assigneeUserId === user.id) return true;
    const actor = await this.scope.getActorEmployee(ctx.organisationId, user.id);
    if (actor && case_.employeeId === actor.id) return true;
    return false;
  }

  async completeOffboardingTask(ctx: RequestContextInput, user: AuthorizableUser, id: string, taskId: string) {
    const case_ = await this.getCase(ctx, id);
    const task = case_.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException('Offboarding task not found');

    if (!(await this.canModifyOffboardingTask(ctx, user, case_, task))) {
      throw new ForbiddenException('You cannot update this task');
    }

    return this.prisma.offboardingTask.update({
      where: { id: taskId },
      data: { status: 'completed', completedAt: new Date(), completedBy: ctx.actorId },
    });
  }

  async reopenOffboardingTask(ctx: RequestContextInput, user: AuthorizableUser, id: string, taskId: string) {
    const case_ = await this.getCase(ctx, id);
    const task = case_.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException('Offboarding task not found');

    if (!(await this.canModifyOffboardingTask(ctx, user, case_, task))) {
      throw new ForbiddenException('You cannot update this task');
    }

    return this.prisma.offboardingTask.update({
      where: { id: taskId },
      data: { status: 'pending', completedAt: null, completedBy: null },
    });
  }

  async completeCase(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    const case_ = await this.getCase(ctx, id);
    if (case_.status === 'completed' || case_.status === 'cancelled') {
      throw new BadRequestException('Offboarding case is already finalised');
    }

    await this.employees.terminate(ctx, user, case_.employeeId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.offboardingCase.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date() },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.offboarding.completed',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'offboarding-case',
        resourceId: id,
        payload: { employeeId: case_.employeeId, type: case_.type },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return updated;
    });
  }

  async cancelCase(ctx: RequestContextInput, id: string) {
    const case_ = await this.getCase(ctx, id);
    if (case_.status === 'completed') {
      throw new BadRequestException('Cannot cancel a completed offboarding case');
    }
    return this.prisma.offboardingCase.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }
}
