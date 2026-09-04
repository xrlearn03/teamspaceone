import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects, type Subject } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { type AddAttachmentDto } from './dto/add-attachment.dto.js';
import { type CreateApprovalDto } from './dto/create-approval.dto.js';
import { type CreateCommentDto } from './dto/create-comment.dto.js';
import { type CreateProjectDto } from './dto/create-project.dto.js';
import { type CreateTaskDto } from './dto/create-task.dto.js';
import { type UpdateCommentDto } from './dto/update-comment.dto.js';
import { type ResolveApprovalDto } from './dto/resolve-approval.dto.js';
import { type UpdateProjectDto } from './dto/update-project.dto.js';
import { type UpdateTaskDto } from './dto/update-task.dto.js';

const projectInclude = { members: { orderBy: { joinedAt: 'asc' as const } } };
const taskStatuses = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done'];
const priorities = ['low', 'medium', 'high', 'urgent'];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async createProject(ctx: OrganisationContextValue, dto: CreateProjectDto) {
    const actorId = this.actor(ctx);
    const name = this.required(dto.name, 'Project name', 120);
    const memberIds = this.ids([actorId, ...(dto.memberIds ?? [])]);
    const id = randomUUID();
    const dates = this.projectDates(dto.startDate, dto.targetDate);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          workspaceId: dto.workspaceId,
          clientId: dto.clientId,
          name,
          description: this.optional(dto.description, 5000),
          ownerId: actorId,
          status: 'active',
          ...dates,
          members: { create: memberIds.map((userId) => ({ id: randomUUID(), userId, role: userId === actorId ? 'owner' : 'member' })) },
        },
        include: projectInclude,
      });
      await this.activity(tx, ctx, id, 'project.created', 'project', id, { name });
      await this.event(tx, ctx, Subjects.PROJECT_CREATED, 'project', id, project);
      return project;
    });
  }

  async listProjects(ctx: OrganisationContextValue, clientId?: string) {
    const actorId = this.actor(ctx);
    return this.prisma.project.findMany({
      where: { organisationId: ctx.organisationId, clientId: clientId || undefined, members: { some: { userId: actorId } } },
      include: projectInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getProject(ctx: OrganisationContextValue, projectId: string) {
    await this.memberProject(ctx, projectId);
    return this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: projectInclude });
  }

  async updateProject(ctx: OrganisationContextValue, projectId: string, dto: UpdateProjectDto) {
    const project = await this.ownerProject(ctx, projectId);
    const data: Prisma.ProjectUpdateInput = {};
    if (dto.name !== undefined) data.name = this.required(dto.name, 'Project name', 120);
    if (dto.description !== undefined) data.description = dto.description === null ? null : this.optional(dto.description, 5000);
    if (dto.clientId !== undefined) data.clientId = dto.clientId;
    if (dto.status !== undefined) {
      if (!['active', 'on_hold', 'completed', 'archived'].includes(dto.status)) throw new BadRequestException('Invalid project status');
      data.status = dto.status;
      data.archivedAt = dto.status === 'archived' ? new Date() : null;
    }
    Object.assign(data, this.projectDates(dto.startDate, dto.targetDate, true));
    if (!Object.keys(data).length && dto.memberIds === undefined) throw new BadRequestException('No project changes supplied');
    const memberIds = dto.memberIds ? this.ids([project.ownerId, ...dto.memberIds]) : null;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (memberIds) {
        await tx.projectMember.deleteMany({ where: { projectId, userId: { notIn: memberIds } } });
        for (const userId of memberIds) {
          await tx.projectMember.upsert({
            where: { projectId_userId: { projectId, userId } },
            create: { id: randomUUID(), projectId, userId, role: userId === project.ownerId ? 'owner' : 'member' },
            update: userId === project.ownerId ? { role: 'owner' } : {},
          });
        }
      }
      const updated = await tx.project.update({ where: { id: projectId }, data, include: projectInclude });
      await this.activity(tx, ctx, projectId, 'project.updated', 'project', projectId, dto);
      await this.event(tx, ctx, Subjects.PROJECT_UPDATED, 'project', projectId, updated);
      return updated;
    });
  }

  async deleteProject(ctx: OrganisationContextValue, projectId: string) {
    await this.ownerProject(ctx, projectId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.project.delete({ where: { id: projectId } });
      await this.event(tx, ctx, Subjects.PROJECT_DELETED, 'project', projectId, { id: projectId });
    });
  }

  async createTask(ctx: OrganisationContextValue, dto: CreateTaskDto) {
    const actorId = this.actor(ctx);
    await this.memberProject(ctx, dto.projectId);
    const title = this.required(dto.title, 'Task title', 300);
    const status = this.status(dto.status);
    const priority = this.priority(dto.priority);
    const id = randomUUID();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const position = dto.position ?? await tx.task.count({ where: { projectId: dto.projectId, status } });
      const task = await tx.task.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          projectId: dto.projectId,
          title,
          description: this.optional(dto.description, 10000),
          assigneeId: dto.assigneeId,
          dueDate: this.date(dto.dueDate),
          status,
          priority,
          position,
          completedAt: status === 'done' ? new Date() : null,
        },
      });
      await this.activity(tx, ctx, dto.projectId, 'task.created', 'task', id, { title, status, assigneeId: dto.assigneeId ?? actorId });
      await this.event(tx, ctx, Subjects.TASK_CREATED, 'task', id, task);
      return task;
    });
  }

  async listTasks(ctx: OrganisationContextValue, projectId: string) {
    await this.memberProject(ctx, projectId);
    return this.prisma.task.findMany({ where: { projectId, organisationId: ctx.organisationId }, orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }] });
  }

  async updateTask(ctx: OrganisationContextValue, taskId: string, dto: UpdateTaskDto) {
    const task = await this.task(ctx, taskId);
    const data: Prisma.TaskUpdateInput = {};
    if (dto.title !== undefined) data.title = this.required(dto.title, 'Task title', 300);
    if (dto.description !== undefined) data.description = dto.description === null ? null : this.optional(dto.description, 10000);
    if (dto.status !== undefined) {
      data.status = this.status(dto.status);
      data.completedAt = data.status === 'done' ? new Date() : null;
    }
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate === null ? null : this.date(dto.dueDate);
    if (dto.priority !== undefined) data.priority = this.priority(dto.priority);
    if (dto.position !== undefined) data.position = Math.max(0, Math.trunc(dto.position));
    if (!Object.keys(data).length) throw new BadRequestException('No task changes supplied');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.task.update({ where: { id: taskId }, data });
      const completed = updated.status === 'done' && task.status !== 'done';
      await this.activity(tx, ctx, task.projectId, completed ? 'task.completed' : 'task.updated', 'task', taskId, dto);
      await this.event(tx, ctx, completed ? Subjects.TASK_COMPLETED : Subjects.TASK_UPDATED, 'task', taskId, updated);
      return updated;
    });
  }

  async deleteTask(ctx: OrganisationContextValue, taskId: string) {
    const task = await this.task(ctx, taskId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.task.delete({ where: { id: taskId } });
      await this.activity(tx, ctx, task.projectId, 'task.deleted', 'task', taskId, { title: task.title });
      await this.event(tx, ctx, Subjects.TASK_UPDATED, 'task', taskId, { id: taskId, projectId: task.projectId, deleted: true });
    });
  }

  async listComments(ctx: OrganisationContextValue, projectId: string, cursor?: string, limit = 50) {
    await this.memberProject(ctx, projectId);
    const take = Math.min(Math.max(limit || 50, 1), 100);
    const rows = await this.prisma.projectComment.findMany({
      where: { projectId, organisationId: ctx.organisationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: take + 1,
    });
    const hasMore = rows.length > take;
    return { items: (hasMore ? rows.slice(0, take) : rows).reverse(), nextCursor: hasMore ? rows[take - 1]?.id ?? null : null };
  }

  async createComment(ctx: OrganisationContextValue, projectId: string, dto: CreateCommentDto) {
    const authorId = this.actor(ctx);
    await this.memberProject(ctx, projectId);
    const content = this.required(dto.content, 'Comment', 10000);
    const id = randomUUID();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const comment = await tx.projectComment.create({ data: { id, organisationId: ctx.organisationId, projectId, authorId, content } });
      await this.activity(tx, ctx, projectId, 'comment.created', 'comment', id);
      await this.event(tx, ctx, Subjects.PROJECT_COMMENT_CREATED, 'project-comment', id, comment);
      return comment;
    });
  }

  async updateComment(ctx: OrganisationContextValue, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.comment(ctx, commentId);
    const content = this.required(dto.content, 'Comment', 10000);
    const editedAt = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.projectComment.update({ where: { id: commentId }, data: { content, editedAt } });
      await this.activity(tx, ctx, comment.projectId, 'comment.updated', 'comment', commentId);
      await this.event(tx, ctx, Subjects.PROJECT_COMMENT_UPDATED, 'project-comment', commentId, updated);
      return updated;
    });
  }

  async deleteComment(ctx: OrganisationContextValue, commentId: string) {
    const comment = await this.comment(ctx, commentId);
    const deletedAt = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deleted = await tx.projectComment.update({ where: { id: commentId }, data: { content: '', deletedAt } });
      await this.activity(tx, ctx, comment.projectId, 'comment.deleted', 'comment', commentId);
      await this.event(tx, ctx, Subjects.PROJECT_COMMENT_DELETED, 'project-comment', commentId, deleted);
      return deleted;
    });
  }

  async listAttachments(ctx: OrganisationContextValue, projectId: string) {
    await this.memberProject(ctx, projectId);
    return this.prisma.projectAttachment.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  }

  async addAttachment(ctx: OrganisationContextValue, projectId: string, dto: AddAttachmentDto) {
    const actorId = this.actor(ctx);
    await this.memberProject(ctx, projectId);
    const fileId = this.required(dto.fileId, 'File ID', 200);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const attachment = await tx.projectAttachment.upsert({
        where: { projectId_fileId: { projectId, fileId } },
        create: { id: randomUUID(), projectId, fileId, addedBy: actorId },
        update: {},
      });
      await this.activity(tx, ctx, projectId, 'attachment.added', 'file', fileId);
      await this.event(tx, ctx, Subjects.PROJECT_ATTACHMENT_ADDED, 'project-attachment', attachment.id, attachment);
      return attachment;
    });
  }

  async removeAttachment(ctx: OrganisationContextValue, projectId: string, fileId: string) {
    await this.memberProject(ctx, projectId);
    const attachment = await this.prisma.projectAttachment.findUnique({ where: { projectId_fileId: { projectId, fileId } } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.projectAttachment.delete({ where: { id: attachment.id } });
      await this.activity(tx, ctx, projectId, 'attachment.removed', 'file', fileId);
      await this.event(tx, ctx, Subjects.PROJECT_ATTACHMENT_REMOVED, 'project-attachment', attachment.id, { ...attachment, deleted: true });
    });
  }

  async listActivity(ctx: OrganisationContextValue, projectId: string, cursor?: string, limit = 50) {
    await this.memberProject(ctx, projectId);
    const take = Math.min(Math.max(limit || 50, 1), 100);
    const rows = await this.prisma.projectActivity.findMany({
      where: { projectId, organisationId: ctx.organisationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: take + 1,
    });
    return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1]?.id ?? null : null };
  }

  async listApprovals(ctx: OrganisationContextValue, projectId?: string, status?: string) {
    const actorId = this.actor(ctx);
    if (projectId) await this.memberProject(ctx, projectId);
    return this.prisma.approval.findMany({
      where: {
        organisationId: ctx.organisationId,
        projectId: projectId || undefined,
        status: status || undefined,
        OR: projectId ? undefined : [{ requestedBy: actorId }, { resolvedBy: actorId }],
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async createApproval(ctx: OrganisationContextValue, dto: CreateApprovalDto) {
    const actorId = this.actor(ctx);
    if (!['task', 'file', 'deliverable'].includes(dto.resourceType)) throw new BadRequestException('Invalid approval resource type');
    if (!dto.resourceId?.trim()) throw new BadRequestException('Resource ID is required');
    if (dto.projectId) await this.memberProject(ctx, dto.projectId);
    const id = randomUUID();
    const requestedAt = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const approval = await tx.approval.create({ data: { id, organisationId: ctx.organisationId, projectId: dto.projectId, resourceType: dto.resourceType, resourceId: dto.resourceId.trim(), requestedBy: actorId, requestedAt, message: this.optional(dto.message, 2000) } });
      if (dto.projectId) await this.activity(tx, ctx, dto.projectId, 'approval.created', 'approval', id, { resourceType: dto.resourceType, resourceId: dto.resourceId });
      await this.event(tx, ctx, Subjects.APPROVAL_CREATED, 'approval', id, { approvalId: id, organisationId: ctx.organisationId, projectId: dto.projectId, resourceType: dto.resourceType, resourceId: dto.resourceId, requestedBy: actorId, requestedAt: requestedAt.toISOString(), message: approval.message ?? undefined });
      return approval;
    });
  }

  async resolveApproval(ctx: OrganisationContextValue, approvalId: string, dto: ResolveApprovalDto) {
    const actorId = this.actor(ctx);
    if (!['approved', 'rejected'].includes(dto.status)) throw new BadRequestException('Approval status must be approved or rejected');
    const approval = await this.prisma.approval.findFirst({ where: { id: approvalId, organisationId: ctx.organisationId } });
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.status !== 'pending') throw new BadRequestException('Approval has already been resolved');
    if (approval.projectId) await this.memberProject(ctx, approval.projectId);
    const resolvedAt = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.approval.update({ where: { id: approvalId }, data: { status: dto.status, resolvedBy: actorId, resolvedAt, message: dto.message === undefined ? approval.message : this.optional(dto.message, 2000) } });
      if (approval.projectId) await this.activity(tx, ctx, approval.projectId, `approval.${dto.status}`, 'approval', approvalId);
      const eventType = dto.status === 'approved' ? Subjects.APPROVAL_APPROVED : Subjects.APPROVAL_REJECTED;
      await this.event(tx, ctx, eventType, 'approval', approvalId, { approvalId, organisationId: ctx.organisationId, projectId: approval.projectId ?? undefined, status: dto.status, resolvedBy: actorId, resolvedAt: resolvedAt.toISOString(), message: updated.message ?? undefined });
      return updated;
    });
  }

  async resolveAccess(projectId: string, actorId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, members: { some: { userId: actorId } } } });
    return project ? { organisationId: project.organisationId, workspaceId: project.workspaceId } : null;
  }

  private actor(ctx: OrganisationContextValue) {
    if (!ctx.actorId) throw new ForbiddenException('Missing actor');
    return ctx.actorId;
  }

  private async memberProject(ctx: OrganisationContextValue, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organisationId: ctx.organisationId, members: { some: { userId: this.actor(ctx) } } }, include: projectInclude });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async ownerProject(ctx: OrganisationContextValue, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organisationId: ctx.organisationId, members: { some: { userId: this.actor(ctx), role: 'owner' } } }, include: projectInclude });
    if (!project) throw new NotFoundException('Project not found or not owned by actor');
    return project;
  }

  private async task(ctx: OrganisationContextValue, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, organisationId: ctx.organisationId, project: { members: { some: { userId: this.actor(ctx) } } } } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async comment(ctx: OrganisationContextValue, commentId: string) {
    const comment = await this.prisma.projectComment.findFirst({ where: { id: commentId, organisationId: ctx.organisationId, authorId: this.actor(ctx), deletedAt: null, project: { members: { some: { userId: ctx.actorId } } } } });
    if (!comment) throw new NotFoundException('Comment not found or not owned by actor');
    return comment;
  }

  private required(value: string | undefined, label: string, max: number) {
    const result = value?.trim();
    if (!result || result.length > max) throw new BadRequestException(`${label} must be between 1 and ${max} characters`);
    return result;
  }

  private optional(value: string | undefined, max: number) {
    const result = value?.trim();
    if (!result) return undefined;
    if (result.length > max) throw new BadRequestException(`Value must not exceed ${max} characters`);
    return result;
  }

  private ids(ids: string[]) {
    return [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
  }

  private status(value?: string) {
    const status = value ?? 'todo';
    if (!taskStatuses.includes(status)) throw new BadRequestException('Invalid task status');
    return status;
  }

  private priority(value?: string) {
    const priority = value ?? 'medium';
    if (!priorities.includes(priority)) throw new BadRequestException('Invalid task priority');
    return priority;
  }

  private date(value?: string) {
    if (!value) return undefined;
    const result = new Date(value);
    if (Number.isNaN(result.getTime())) throw new BadRequestException('Invalid date');
    return result;
  }

  private projectDates(start?: string | null, target?: string | null, partial = false) {
    const result: { startDate?: Date | null; targetDate?: Date | null } = {};
    if (!partial || start !== undefined) result.startDate = start === null ? null : this.date(start);
    if (!partial || target !== undefined) result.targetDate = target === null ? null : this.date(target);
    if (result.startDate && result.targetDate && result.startDate > result.targetDate) throw new BadRequestException('Target date must be after start date');
    return result;
  }

  private activity(tx: Prisma.TransactionClient, ctx: OrganisationContextValue, projectId: string, action: string, resourceType: string, resourceId: string, metadata?: unknown) {
    return tx.projectActivity.create({ data: { id: randomUUID(), organisationId: ctx.organisationId, projectId, actorId: this.actor(ctx), action, resourceType, resourceId, metadata: metadata === undefined ? undefined : metadata as Prisma.InputJsonValue } });
  }

  private event(tx: Prisma.TransactionClient, ctx: OrganisationContextValue, eventType: Subject, resourceType: string, resourceId: string, payload: unknown) {
    return this.outbox.createEvent(tx, createEventEnvelope({ eventType, organisationId: ctx.organisationId, actorId: ctx.actorId, resourceType, resourceId, correlationId: ctx.correlationId, payload }), eventType);
  }
}
