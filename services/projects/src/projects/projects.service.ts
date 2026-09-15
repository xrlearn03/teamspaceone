import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hasPermission } from '@teamspace-one/authorization';
import { createEventEnvelope, Subjects, type Subject } from '@teamspace-one/event-contracts';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AuthorizationClientService } from './authorization.client.js';
import { type AddAttachmentDto } from './dto/add-attachment.dto.js';
import { type CreateApprovalDto } from './dto/create-approval.dto.js';
import { type CreateCommentDto } from './dto/create-comment.dto.js';
import { type CreateProjectDto } from './dto/create-project.dto.js';
import { type CreateTaskDto } from './dto/create-task.dto.js';
import { type CreateTaskDependencyDto } from './dto/create-task-dependency.dto.js';
import { type CreateTaskFromMessageDto } from './dto/create-task-from-message.dto.js';
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
    private readonly authorization: AuthorizationClientService,
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
    const viewAll = await this.hasProjectOrganisationScope(ctx);
    return this.prisma.project.findMany({
      where: {
        organisationId: ctx.organisationId,
        clientId: clientId || undefined,
        ...(viewAll ? {} : { members: { some: { userId: actorId } } }),
      },
      include: projectInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listProjectTemplates(ctx: OrganisationContextValue) {
    const actorId = this.actor(ctx);
    const viewAll = await this.hasProjectOrganisationScope(ctx);
    return this.prisma.project.findMany({
      where: {
        organisationId: ctx.organisationId,
        isTemplate: true,
        ...(viewAll ? {} : { members: { some: { userId: actorId } } }),
      },
      include: projectInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getProject(ctx: OrganisationContextValue, projectId: string) {
    return this.viewableProject(ctx, projectId);
  }

  async listMilestones(ctx: OrganisationContextValue, projectId: string) {
    await this.viewableProject(ctx, projectId);
    return this.prisma.milestone.findMany({ where: { projectId, organisationId: ctx.organisationId }, include: { _count: { select: { tasks: true } } }, orderBy: [{ position: 'asc' }, { dueDate: 'asc' }] });
  }

  async createMilestone(ctx: OrganisationContextValue, projectId: string, dto: { name: string; description?: string; dueDate?: string; status?: string }) {
    await this.ownerProject(ctx, projectId);
    const name = this.required(dto.name, 'Milestone name', 120);
    const status = dto.status ?? 'pending';
    if (!['pending', 'in_progress', 'completed'].includes(status)) throw new BadRequestException('Invalid milestone status');
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) throw new BadRequestException('Invalid milestone due date');
    const position = await this.prisma.milestone.count({ where: { projectId } });
    return this.prisma.milestone.create({ data: { id: randomUUID(), organisationId: ctx.organisationId, projectId, name, description: this.optional(dto.description, 2000), dueDate, status, position } });
  }

  async updateMilestone(ctx: OrganisationContextValue, projectId: string, id: string, dto: { name?: string; description?: string; dueDate?: string | null; status?: string; position?: number }) {
    await this.ownerProject(ctx, projectId);
    const existing = await this.prisma.milestone.findFirst({ where: { id, projectId, organisationId: ctx.organisationId } });
    if (!existing) throw new NotFoundException('Milestone not found');
    if (dto.status && !['pending', 'in_progress', 'completed'].includes(dto.status)) throw new BadRequestException('Invalid milestone status');
    const dueDate = dto.dueDate === null ? null : dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (dueDate && Number.isNaN(dueDate.getTime())) throw new BadRequestException('Invalid milestone due date');
    return this.prisma.milestone.update({ where: { id }, data: { name: dto.name === undefined ? undefined : this.required(dto.name, 'Milestone name', 120), description: dto.description === undefined ? undefined : this.optional(dto.description, 2000), dueDate, status: dto.status, position: dto.position } });
  }

  async deleteMilestone(ctx: OrganisationContextValue, projectId: string, id: string) {
    await this.ownerProject(ctx, projectId);
    const result = await this.prisma.milestone.deleteMany({ where: { id, projectId, organisationId: ctx.organisationId } });
    if (!result.count) throw new NotFoundException('Milestone not found');
  }

  async listSprints(ctx: OrganisationContextValue, projectId: string) {
    await this.viewableProject(ctx, projectId);
    return this.prisma.sprint.findMany({ where: { projectId, organisationId: ctx.organisationId }, include: { _count: { select: { tasks: true } } }, orderBy: { startDate: 'desc' } });
  }

  async createSprint(ctx: OrganisationContextValue, projectId: string, dto: { name: string; goal?: string; startDate: string; endDate: string }) {
    await this.ownerProject(ctx, projectId);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) throw new BadRequestException('Sprint end date must be on or after its start date');
    return this.prisma.sprint.create({ data: { id: randomUUID(), organisationId: ctx.organisationId, projectId, name: this.required(dto.name, 'Sprint name', 120), goal: this.optional(dto.goal, 2000), startDate, endDate } });
  }

  async updateSprint(ctx: OrganisationContextValue, projectId: string, id: string, dto: { name?: string; goal?: string; startDate?: string; endDate?: string; status?: string }) {
    await this.ownerProject(ctx, projectId);
    const existing = await this.prisma.sprint.findFirst({ where: { id, projectId, organisationId: ctx.organisationId } });
    if (!existing) throw new NotFoundException('Sprint not found');
    if (dto.status && !['planned', 'active', 'completed', 'cancelled'].includes(dto.status)) throw new BadRequestException('Invalid sprint status');
    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) throw new BadRequestException('Sprint end date must be on or after its start date');
    return this.prisma.sprint.update({ where: { id }, data: { name: dto.name === undefined ? undefined : this.required(dto.name, 'Sprint name', 120), goal: dto.goal === undefined ? undefined : this.optional(dto.goal, 2000), startDate: dto.startDate ? startDate : undefined, endDate: dto.endDate ? endDate : undefined, status: dto.status } });
  }

  async deleteSprint(ctx: OrganisationContextValue, projectId: string, id: string) {
    await this.ownerProject(ctx, projectId);
    const result = await this.prisma.sprint.deleteMany({ where: { id, projectId, organisationId: ctx.organisationId } });
    if (!result.count) throw new NotFoundException('Sprint not found');
  }

  async markProjectAsTemplate(ctx: OrganisationContextValue, projectId: string) {
    const project = await this.ownerProject(ctx, projectId);
    if (project.isTemplate) return project;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.project.update({
        where: { id: projectId },
        data: { isTemplate: true },
        include: projectInclude,
      });
      await this.activity(tx, ctx, projectId, 'project.templated', 'project', projectId, { name: updated.name });
      await this.event(tx, ctx, Subjects.PROJECT_UPDATED, 'project', projectId, updated);
      return updated;
    });
  }

  async unmarkProjectAsTemplate(ctx: OrganisationContextValue, projectId: string) {
    const project = await this.ownerProject(ctx, projectId);
    if (!project.isTemplate) return project;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.project.update({
        where: { id: projectId },
        data: { isTemplate: false },
        include: projectInclude,
      });
      await this.activity(tx, ctx, projectId, 'project.untemplated', 'project', projectId, { name: updated.name });
      await this.event(tx, ctx, Subjects.PROJECT_UPDATED, 'project', projectId, updated);
      return updated;
    });
  }

  async createProjectFromTemplate(ctx: OrganisationContextValue, templateId: string, dto: CreateProjectDto) {
    const actorId = this.actor(ctx);
    const template = await this.viewableProject(ctx, templateId);
    if (!template.isTemplate) throw new BadRequestException('Project is not a template');
    const name = this.required(dto.name, 'Project name', 120);
    const memberIds = this.ids([actorId, ...(dto.memberIds ?? [])]);
    const id = randomUUID();
    const dates = this.projectDates(dto.startDate, dto.targetDate);

    const tasks = await this.prisma.task.findMany({
      where: { projectId: templateId, organisationId: ctx.organisationId },
      orderBy: { createdAt: 'asc' },
    });

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
          isTemplate: false,
          templateId,
          ...dates,
          members: { create: memberIds.map((userId) => ({ id: randomUUID(), userId, role: userId === actorId ? 'owner' : 'member' })) },
        },
        include: projectInclude,
      });
      if (tasks.length) {
        await tx.task.createMany({
          data: tasks.map((task, index) => ({
            id: randomUUID(),
            organisationId: ctx.organisationId,
            projectId: id,
            title: task.title,
            description: task.description,
            status: 'todo',
            priority: task.priority,
            position: index,
            startDate: task.startDate,
            dueDate: task.dueDate,
          })),
        });
      }
      await this.activity(tx, ctx, id, 'project.created', 'project', id, { name, fromTemplate: templateId });
      await this.event(tx, ctx, Subjects.PROJECT_CREATED, 'project', id, project);
      return project;
    });
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
    const project = await this.memberProject(ctx, dto.projectId);
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
          startDate: this.date(dto.startDate),
          dueDate: this.date(dto.dueDate),
          status,
          priority,
          position,
          milestoneId: dto.milestoneId,
          sprintId: dto.sprintId,
          completedAt: status === 'done' ? new Date() : null,
        },
      });
      await this.activity(tx, ctx, dto.projectId, 'task.created', 'task', id, { title, status, assigneeId: dto.assigneeId ?? actorId });
      await this.event(tx, ctx, Subjects.TASK_CREATED, 'task', id, { ...task, memberIds: project.members.map((m) => m.userId) });
      return task;
    });
  }

  async listTasks(ctx: OrganisationContextValue, projectId: string) {
    await this.viewableProject(ctx, projectId);
    return this.prisma.task.findMany({ where: { projectId, organisationId: ctx.organisationId }, orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }] });
  }

  async updateTask(ctx: OrganisationContextValue, taskId: string, dto: UpdateTaskDto) {
    const task = await this.task(ctx, taskId);
    const project = await this.memberProject(ctx, task.projectId);
    const data: Prisma.TaskUpdateInput = {};
    if (dto.title !== undefined) data.title = this.required(dto.title, 'Task title', 300);
    if (dto.description !== undefined) data.description = dto.description === null ? null : this.optional(dto.description, 10000);
    if (dto.status !== undefined) {
      data.status = this.status(dto.status);
      data.completedAt = data.status === 'done' ? new Date() : null;
    }
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.startDate !== undefined) data.startDate = dto.startDate === null ? null : this.date(dto.startDate);
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate === null ? null : this.date(dto.dueDate);
    if (dto.priority !== undefined) data.priority = this.priority(dto.priority);
    if (dto.position !== undefined) data.position = Math.max(0, Math.trunc(dto.position));
    if (dto.milestoneId !== undefined) data.milestone = dto.milestoneId === null ? { disconnect: true } : { connect: { id: dto.milestoneId } };
    if (dto.sprintId !== undefined) data.sprint = dto.sprintId === null ? { disconnect: true } : { connect: { id: dto.sprintId } };
    if (!Object.keys(data).length) throw new BadRequestException('No task changes supplied');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.task.update({ where: { id: taskId }, data });
      const completed = updated.status === 'done' && task.status !== 'done';
      await this.activity(tx, ctx, task.projectId, completed ? 'task.completed' : 'task.updated', 'task', taskId, dto);
      await this.event(tx, ctx, completed ? Subjects.TASK_COMPLETED : Subjects.TASK_UPDATED, 'task', taskId, { ...updated, memberIds: project.members.map((m) => m.userId) });
      return updated;
    });
  }

  async deleteTask(ctx: OrganisationContextValue, taskId: string) {
    const task = await this.task(ctx, taskId);
    const project = await this.memberProject(ctx, task.projectId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.task.delete({ where: { id: taskId } });
      await this.activity(tx, ctx, task.projectId, 'task.deleted', 'task', taskId, { title: task.title });
      await this.event(tx, ctx, Subjects.TASK_UPDATED, 'task', taskId, { id: taskId, projectId: task.projectId, deleted: true, memberIds: project.members.map((m) => m.userId) });
    });
  }

  async listTaskAttachments(ctx: OrganisationContextValue, taskId: string) {
    const task = await this.task(ctx, taskId);
    return this.prisma.taskAttachment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'desc' } });
  }

  async addTaskAttachment(ctx: OrganisationContextValue, taskId: string, dto: AddAttachmentDto) {
    const actorId = this.actor(ctx);
    const task = await this.task(ctx, taskId);
    const fileId = this.required(dto.fileId, 'File ID', 200);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const attachment = await tx.taskAttachment.upsert({
        where: { taskId_fileId: { taskId: task.id, fileId } },
        create: { id: randomUUID(), taskId: task.id, fileId, addedBy: actorId },
        update: {},
      });
      await this.activity(tx, ctx, task.projectId, 'task.attachment.added', 'file', fileId, { taskId: task.id });
      await this.event(tx, ctx, Subjects.TASK_ATTACHMENT_ADDED, 'task-attachment', attachment.id, attachment);
      return attachment;
    });
  }

  async removeTaskAttachment(ctx: OrganisationContextValue, taskId: string, fileId: string) {
    const task = await this.task(ctx, taskId);
    const attachment = await this.prisma.taskAttachment.findUnique({ where: { taskId_fileId: { taskId: task.id, fileId } } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.taskAttachment.delete({ where: { id: attachment.id } });
      await this.activity(tx, ctx, task.projectId, 'task.attachment.removed', 'file', fileId, { taskId: task.id });
      await this.event(tx, ctx, Subjects.TASK_ATTACHMENT_REMOVED, 'task-attachment', attachment.id, { ...attachment, deleted: true });
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
    const project = await this.memberProject(ctx, projectId);
    const content = this.required(dto.content, 'Comment', 10000);
    const id = randomUUID();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const comment = await tx.projectComment.create({ data: { id, organisationId: ctx.organisationId, projectId, authorId, content } });
      await this.activity(tx, ctx, projectId, 'comment.created', 'comment', id);
      await this.event(tx, ctx, Subjects.PROJECT_COMMENT_CREATED, 'project-comment', id, { ...comment, memberIds: project.members.map((m) => m.userId) });
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
    const project = dto.projectId ? await this.memberProject(ctx, dto.projectId) : null;
    const id = randomUUID();
    const requestedAt = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const approval = await tx.approval.create({ data: { id, organisationId: ctx.organisationId, projectId: dto.projectId, resourceType: dto.resourceType, resourceId: dto.resourceId.trim(), requestedBy: actorId, requestedAt, message: this.optional(dto.message, 2000) } });
      if (dto.projectId) await this.activity(tx, ctx, dto.projectId, 'approval.created', 'approval', id, { resourceType: dto.resourceType, resourceId: dto.resourceId });
      await this.event(tx, ctx, Subjects.APPROVAL_CREATED, 'approval', id, { approvalId: id, organisationId: ctx.organisationId, projectId: dto.projectId, resourceType: dto.resourceType, resourceId: dto.resourceId, requestedBy: actorId, memberIds: project ? project.members.map((m) => m.userId) : [], requestedAt: requestedAt.toISOString(), message: approval.message ?? undefined });
      return approval;
    });
  }

  async resolveApproval(ctx: OrganisationContextValue, approvalId: string, dto: ResolveApprovalDto) {
    const actorId = this.actor(ctx);
    if (!['approved', 'rejected'].includes(dto.status)) throw new BadRequestException('Approval status must be approved or rejected');
    const approval = await this.prisma.approval.findFirst({ where: { id: approvalId, organisationId: ctx.organisationId } });
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.status !== 'pending') throw new BadRequestException('Approval has already been resolved');
    if (approval.requestedBy === actorId) throw new ForbiddenException('Cannot resolve your own approval');
    const project = approval.projectId ? await this.ownerProject(ctx, approval.projectId) : null;
    const resolvedAt = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.approval.update({ where: { id: approvalId }, data: { status: dto.status, resolvedBy: actorId, resolvedAt, message: dto.message === undefined ? approval.message : this.optional(dto.message, 2000) } });
      if (approval.projectId) await this.activity(tx, ctx, approval.projectId, `approval.${dto.status}`, 'approval', approvalId);
      const eventType = dto.status === 'approved' ? Subjects.APPROVAL_APPROVED : Subjects.APPROVAL_REJECTED;
      await this.event(tx, ctx, eventType, 'approval', approvalId, { approvalId, organisationId: ctx.organisationId, projectId: approval.projectId ?? undefined, requestedBy: approval.requestedBy, memberIds: project ? project.members.map((m) => m.userId) : [], status: dto.status, resolvedBy: actorId, resolvedAt: resolvedAt.toISOString(), message: updated.message ?? undefined });
      return updated;
    });
  }

  async createTaskFromMessage(ctx: OrganisationContextValue, dto: CreateTaskFromMessageDto) {
    const actorId = this.actor(ctx);
    const project = await this.memberProject(ctx, dto.projectId);
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
          sourceMessageId: dto.messageId,
          sourceChannelId: dto.channelId,
          title,
          description: this.optional(dto.description, 10000),
          assigneeId: dto.assigneeId,
          startDate: this.date(dto.startDate),
          dueDate: this.date(dto.dueDate),
          status,
          priority,
          position,
          completedAt: status === 'done' ? new Date() : null,
        },
      });
      await this.activity(tx, ctx, dto.projectId, 'task.created.from_message', 'task', id, { title, status, messageId: dto.messageId, channelId: dto.channelId });
      await this.event(tx, ctx, Subjects.TASK_CREATED, 'task', id, { ...task, memberIds: project.members.map((m) => m.userId) });
      return task;
    });
  }

  async listTaskDependencies(ctx: OrganisationContextValue, taskId: string) {
    const task = await this.task(ctx, taskId);
    const [dependencies, blockedBy] = await Promise.all([
      this.prisma.taskDependency.findMany({ where: { taskId: task.id }, include: { dependsOnTask: { select: { id: true, title: true, status: true } } } }),
      this.prisma.taskDependency.findMany({ where: { dependsOnTaskId: task.id }, include: { task: { select: { id: true, title: true, status: true } } } }),
    ]);
    return { dependencies, blockedBy };
  }

  async addTaskDependency(ctx: OrganisationContextValue, taskId: string, dto: CreateTaskDependencyDto) {
    const task = await this.task(ctx, taskId);
    if (task.id === dto.dependsOnTaskId) throw new BadRequestException('A task cannot depend on itself');
    const dependsOn = await this.prisma.task.findFirst({
      where: { id: dto.dependsOnTaskId, organisationId: ctx.organisationId, projectId: task.projectId },
    });
    if (!dependsOn) throw new NotFoundException('Dependency task not found in the same project');

    const hasCycle = await this.wouldCreateCycle(task.id, dto.dependsOnTaskId);
    if (hasCycle) throw new BadRequestException('Adding this dependency would create a cycle');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const dep = await tx.taskDependency.create({
        data: { id: randomUUID(), taskId: task.id, dependsOnTaskId: dto.dependsOnTaskId },
        include: { dependsOnTask: { select: { id: true, title: true, status: true } } },
      });
      await this.activity(tx, ctx, task.projectId, 'task.dependency.added', 'task', taskId, { dependsOnTaskId: dto.dependsOnTaskId });
      await this.event(tx, ctx, Subjects.TASK_UPDATED, 'task', taskId, { id: task.id, projectId: task.projectId, dependencies: [dep] });
      return dep;
    });
  }

  async removeTaskDependency(ctx: OrganisationContextValue, taskId: string, dependencyId: string) {
    const task = await this.task(ctx, taskId);
    const dep = await this.prisma.taskDependency.findFirst({ where: { id: dependencyId, taskId: task.id } });
    if (!dep) throw new NotFoundException('Dependency not found');
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.taskDependency.delete({ where: { id: dependencyId } });
      await this.activity(tx, ctx, task.projectId, 'task.dependency.removed', 'task', taskId, { dependsOnTaskId: dep.dependsOnTaskId });
      await this.event(tx, ctx, Subjects.TASK_UPDATED, 'task', taskId, { id: task.id, projectId: task.projectId });
      return { id: dependencyId, removed: true };
    });
  }

  private async wouldCreateCycle(startTaskId: string, targetTaskId: string): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [targetTaskId];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === startTaskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const next = await this.prisma.taskDependency.findMany({ where: { taskId: current }, select: { dependsOnTaskId: true } });
      queue.push(...next.map((d) => d.dependsOnTaskId));
    }
    return false;
  }

  async resolveAccess(projectId: string, actorId: string, organisationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organisationId, members: { some: { userId: actorId } } },
    });
    return project ? { organisationId: project.organisationId, workspaceId: project.workspaceId } : null;
  }

  async resolveTaskAccess(taskId: string, actorId: string, organisationId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organisationId, project: { members: { some: { userId: actorId } } } },
      include: { project: { select: { workspaceId: true } } },
    });
    return task ? { organisationId: task.organisationId, workspaceId: task.project.workspaceId } : null;
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

  private async hasProjectOrganisationScope(ctx: OrganisationContextValue): Promise<boolean> {
    const actorId = this.actor(ctx);
    const user = await this.authorization.getUserContext(ctx.organisationId, actorId, ctx.correlationId);
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (!hasPermission(user, 'collaboration.project.view')) return false;
    return user.dataScopes.some(
      (s) => (s.module === 'collaboration' || s.module === '*') && s.scope === 'organisation',
    );
  }

  private async viewableProject(ctx: OrganisationContextValue, projectId: string) {
    if (await this.hasProjectOrganisationScope(ctx)) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, organisationId: ctx.organisationId }, include: projectInclude });
      if (!project) throw new NotFoundException('Project not found');
      return project;
    }
    return this.memberProject(ctx, projectId);
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
