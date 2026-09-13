import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CreateTimeEntryDto } from './dto/create-time-entry.dto.js';
import { type UpdateTimeEntryDto } from './dto/update-time-entry.dto.js';

const ENTRY_INCLUDE = {
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
} satisfies Prisma.TimeEntryInclude;

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** List the caller's entries within a [from, to) date range. */
  list(ctx: OrganisationContextValue, from?: string, to?: string) {
    const where: Prisma.TimeEntryWhereInput = {
      organisationId: ctx.organisationId,
      userId: this.actor(ctx),
    };
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = this.date(from, 'from');
    if (to) range.lt = this.date(to, 'to');
    if (range.gte || range.lt) where.date = range;
    return this.prisma.timeEntry.findMany({
      where,
      include: ENTRY_INCLUDE,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(ctx: OrganisationContextValue, dto: CreateTimeEntryDto) {
    const userId = this.actor(ctx);
    const date = this.date(dto.date, 'date');
    const minutes = this.minutes(dto.minutes);
    const { projectId, taskId } = await this.resolveRefs(ctx, dto.projectId, dto.taskId);
    const label = this.optional(dto.label, 300);
    if (!taskId && !label) {
      throw new BadRequestException('Provide a task or a label for the entry');
    }
    return this.prisma.timeEntry.create({
      data: {
        organisationId: ctx.organisationId,
        userId,
        projectId,
        taskId,
        label,
        description: this.optional(dto.description, 2000),
        date,
        minutes,
        billable: Boolean(dto.billable),
      },
      include: ENTRY_INCLUDE,
    });
  }

  async update(ctx: OrganisationContextValue, entryId: string, dto: UpdateTimeEntryDto) {
    const entry = await this.ownEntry(ctx, entryId);
    const data: Prisma.TimeEntryUpdateInput = {};
    if (dto.projectId !== undefined || dto.taskId !== undefined) {
      const { projectId, taskId } = await this.resolveRefs(
        ctx,
        dto.projectId === undefined ? entry.projectId ?? undefined : (dto.projectId ?? undefined),
        dto.taskId === undefined ? entry.taskId ?? undefined : (dto.taskId ?? undefined),
      );
      data.project = projectId ? { connect: { id: projectId } } : { disconnect: true };
      data.task = taskId ? { connect: { id: taskId } } : { disconnect: true };
    }
    if (dto.label !== undefined) data.label = dto.label === null ? null : this.optional(dto.label, 300);
    if (dto.description !== undefined) {
      data.description = dto.description === null ? null : this.optional(dto.description, 2000);
    }
    if (dto.date !== undefined) data.date = this.date(dto.date, 'date');
    if (dto.minutes !== undefined) data.minutes = this.minutes(dto.minutes);
    if (dto.billable !== undefined) data.billable = Boolean(dto.billable);
    if (!Object.keys(data).length) throw new BadRequestException('No entry changes supplied');
    return this.prisma.timeEntry.update({
      where: { id: entry.id },
      data,
      include: ENTRY_INCLUDE,
    });
  }

  async remove(ctx: OrganisationContextValue, entryId: string) {
    const entry = await this.ownEntry(ctx, entryId);
    await this.prisma.timeEntry.delete({ where: { id: entry.id } });
  }

  /** Validate referenced project/task belong to the caller's organisation. */
  private async resolveRefs(ctx: OrganisationContextValue, projectId?: string, taskId?: string) {
    let task: { id: string; projectId: string } | null = null;
    if (taskId) {
      task = await this.prisma.task.findFirst({
        where: { id: taskId, organisationId: ctx.organisationId },
        select: { id: true, projectId: true },
      });
      if (!task) throw new NotFoundException('Task not found');
      // A task implies its project.
      projectId = task.projectId;
    }
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organisationId: ctx.organisationId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }
    return { projectId: projectId ?? null, taskId: task?.id ?? null };
  }

  private actor(ctx: OrganisationContextValue) {
    if (!ctx.actorId) throw new ForbiddenException('Missing actor');
    return ctx.actorId;
  }

  private async ownEntry(ctx: OrganisationContextValue, entryId: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: entryId, organisationId: ctx.organisationId, userId: this.actor(ctx) },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    return entry;
  }

  private minutes(value: number | undefined) {
    const result = Math.trunc(Number(value));
    if (!Number.isFinite(result) || result <= 0 || result > 24 * 60) {
      throw new BadRequestException('Minutes must be between 1 and 1440');
    }
    return result;
  }

  private optional(value: string | undefined, max: number) {
    const result = value?.trim();
    if (!result) return undefined;
    if (result.length > max) throw new BadRequestException(`Value must not exceed ${max} characters`);
    return result;
  }

  private date(value: string | undefined, field: string) {
    const result = value ? new Date(value) : undefined;
    if (!result || Number.isNaN(result.getTime())) {
      throw new BadRequestException(`Invalid ${field} date`);
    }
    return result;
  }
}
