import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import type { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { HrmsScopeService } from './scope.service.js';
import { type RequestContextInput } from './employees.service.js';

interface CreateCycleInput {
  name: string;
  startDate?: Date;
  endDate?: Date;
}

interface UpdateCycleInput {
  name?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: string;
}

interface CreateReviewInput {
  cycleId?: string;
  employeeId: string;
  reviewerId?: string;
}

interface UpdateReviewInput {
  overallRating?: number;
  ratings?: unknown;
  strengths?: string;
  improvements?: string;
  comments?: string;
}

interface CreateGoalInput {
  employeeId: string;
  cycleId?: string;
  title: string;
  description?: string;
  targetDate?: Date;
}

interface UpdateGoalInput {
  title?: string;
  description?: string | null;
  targetDate?: Date | null;
  status?: string;
  progress?: number;
}

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: HrmsScopeService,
  ) {}

  /* ───────────── Review Cycles ───────────── */

  listCycles(organisationId: string) {
    return this.prisma.reviewCycle.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCycle(organisationId: string, input: CreateCycleInput) {
    return this.prisma.reviewCycle.create({
      data: {
        organisationId,
        name: input.name,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: 'draft',
      },
    });
  }

  async updateCycle(organisationId: string, id: string, input: UpdateCycleInput) {
    const existing = await this.prisma.reviewCycle.findFirst({
      where: { id, organisationId },
    });
    if (!existing) throw new NotFoundException('Review cycle not found');

    const data: Prisma.ReviewCycleUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.startDate !== undefined) data.startDate = input.startDate ?? null;
    if (input.endDate !== undefined) data.endDate = input.endDate ?? null;
    if (input.status !== undefined) data.status = input.status;

    return this.prisma.reviewCycle.update({ where: { id }, data });
  }

  /* ───────────── Performance Reviews ───────────── */

  async listReviews(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { cycleId?: string; employeeId?: string } = {},
  ) {
    const { employeeWhere } = await this.scope.resolve(user, ctx.organisationId);
    const where: Prisma.PerformanceReviewWhereInput = {
      organisationId: ctx.organisationId,
      ...(filters.cycleId ? { cycleId: filters.cycleId } : {}),
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      employee: employeeWhere,
    };
    return this.prisma.performanceReview.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReview(ctx: RequestContextInput, input: CreateReviewInput) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, organisationId: ctx.organisationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.performanceReview.create({
      data: {
        organisationId: ctx.organisationId,
        cycleId: input.cycleId ?? null,
        employeeId: input.employeeId,
        reviewerId: input.reviewerId ?? null,
        status: 'pending',
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });
  }

  async updateReview(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
    input: UpdateReviewInput,
  ) {
    const review = await this.prisma.performanceReview.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: { employee: { select: { userId: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');

    const canManage = can(user, 'hrms.performance.manage');
    const isReviewer = review.reviewerId === user.id;
    const isOwn = review.employee?.userId === user.id;
    if (!canManage && !isReviewer && !isOwn) {
      throw new ForbiddenException('You cannot edit this review');
    }

    const data: Prisma.PerformanceReviewUpdateInput = {};
    if (input.overallRating !== undefined) data.overallRating = input.overallRating;
    if (input.ratings !== undefined) data.ratings = input.ratings as unknown as Prisma.InputJsonValue;
    if (input.strengths !== undefined) data.strengths = input.strengths;
    if (input.improvements !== undefined) data.improvements = input.improvements;
    if (input.comments !== undefined) data.comments = input.comments;
    data.submittedAt = new Date();
    data.status = 'submitted';

    return this.prisma.performanceReview.update({
      where: { id },
      data,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });
  }

  async acknowledgeReview(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
  ) {
    const review = await this.prisma.performanceReview.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: { employee: { select: { userId: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.employee?.userId !== user.id) {
      throw new ForbiddenException('Only the reviewee can acknowledge this review');
    }
    return this.prisma.performanceReview.update({
      where: { id },
      data: { acknowledgedAt: new Date(), status: 'acknowledged' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });
  }

  /* ───────────── Goals ───────────── */

  async listGoals(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    filters: { cycleId?: string; employeeId?: string } = {},
  ) {
    const { employeeWhere } = await this.scope.resolve(user, ctx.organisationId);
    const where: Prisma.GoalWhereInput = {
      organisationId: ctx.organisationId,
      ...(filters.cycleId ? { cycleId: filters.cycleId } : {}),
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      employee: employeeWhere,
    };
    return this.prisma.goal.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createGoal(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    input: CreateGoalInput,
  ) {
    const { employeeWhere } = await this.scope.resolve(user, ctx.organisationId);
    const target = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, ...employeeWhere, organisationId: ctx.organisationId },
    });
    if (!target) throw new NotFoundException('Employee not found or outside your scope');

    return this.prisma.goal.create({
      data: {
        organisationId: ctx.organisationId,
        employeeId: input.employeeId,
        cycleId: input.cycleId ?? null,
        title: input.title,
        description: input.description ?? null,
        targetDate: input.targetDate ?? null,
        createdBy: ctx.actorId,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });
  }

  async updateGoal(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    id: string,
    input: UpdateGoalInput,
  ) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: { employee: { select: { userId: true } } },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    const canManage = can(user, 'hrms.performance.manage');
    const isOwn = goal.employee?.userId === user.id;
    if (!canManage && !isOwn) {
      throw new ForbiddenException('You cannot edit this goal');
    }

    const data: Prisma.GoalUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description ?? null;
    if (input.targetDate !== undefined) data.targetDate = input.targetDate ?? null;
    if (input.status !== undefined) data.status = input.status;
    if (input.progress !== undefined) data.progress = input.progress;

    return this.prisma.goal.update({
      where: { id },
      data,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });
  }
}
