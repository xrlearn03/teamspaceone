import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { type CreateProjectDto } from './dto/create-project.dto.js';
import { type CreateTaskDto } from './dto/create-task.dto.js';
import { type UpdateTaskDto } from './dto/update-task.dto.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async createProject(ctx: OrganisationContextValue, dto: CreateProjectDto) {
    const organisationId = ctx.organisationId;
    const ownerId = ctx.actorId;
    if (!ownerId) throw new ForbiddenException('Missing actor');

    const id = randomUUID();
    const payload = { id, organisationId, workspaceId: dto.workspaceId ?? null, name: dto.name, description: dto.description ?? null, ownerId };

    const envelope = createEventEnvelope({
      eventType: Subjects.PROJECT_CREATED,
      organisationId,
      actorId: ownerId,
      resourceType: 'project',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.create({
        data: { id, organisationId, workspaceId: dto.workspaceId, name: dto.name, description: dto.description, ownerId, status: 'active' },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.PROJECT_CREATED);
      return project;
    });
  }

  async listProjects(ctx: OrganisationContextValue) {
    return this.prisma.project.findMany({
      where: { organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTask(ctx: OrganisationContextValue, dto: CreateTaskDto) {
    const organisationId = ctx.organisationId;
    const assigneeId = ctx.actorId;
    if (!assigneeId) throw new ForbiddenException('Missing actor');

    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organisationId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const id = randomUUID();
    const payload = { id, organisationId, projectId: dto.projectId, title: dto.title, description: dto.description ?? null, assigneeId: dto.assigneeId ?? assigneeId };

    const envelope = createEventEnvelope({
      eventType: Subjects.TASK_CREATED,
      organisationId,
      actorId: assigneeId,
      resourceType: 'task',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const task = await tx.task.create({
        data: { id, organisationId, projectId: dto.projectId, title: dto.title, description: dto.description, assigneeId: dto.assigneeId, status: 'todo' },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.TASK_CREATED);
      return task;
    });
  }

  async listTasks(ctx: OrganisationContextValue, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organisationId: ctx.organisationId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.prisma.task.findMany({
      where: { projectId, organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTask(ctx: OrganisationContextValue, taskId: string, dto: UpdateTaskDto) {
    const organisationId = ctx.organisationId;
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organisationId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.status === 'completed') data.completedAt = new Date();

    const envelope = createEventEnvelope({
      eventType: dto.status === 'completed' ? Subjects.TASK_COMPLETED : Subjects.TASK_UPDATED,
      organisationId,
      actorId: ctx.actorId,
      resourceType: 'task',
      resourceId: taskId,
      correlationId: ctx.correlationId,
      payload: { id: taskId, ...data },
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data,
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);
      return updated;
    });
  }
}
