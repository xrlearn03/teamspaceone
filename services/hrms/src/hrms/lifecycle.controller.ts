import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentOrganisation,
  type OrganisationContextValue,
} from '@teamspace-one/organisation-context';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import {
  CurrentUser,
  HrmsPermissionGuard,
  RequirePermissions,
} from './permission.guard.js';
import { LifecycleService } from './lifecycle.service.js';
import { PerformanceService } from './performance.service.js';
import { AnalyticsService } from './analytics.service.js';
import { CreateEmployeeDto } from './employees.controller.js';
import type { RequestContextInput } from './employees.service.js';

function toCtx(org: OrganisationContextValue): RequestContextInput {
  return {
    organisationId: org.organisationId,
    actorId: org.actorId ?? '',
    correlationId: org.correlationId,
  };
}

export class OnboardingTemplateTaskDto {
  title!: string;
  description?: string;
  category?: string;
  assigneeRole?: string;
  dueDaysOffset?: number;
  sortOrder?: number;
}

export class OnboardingTemplateDto {
  name!: string;
  description?: string;
  isActive?: boolean;
  tasks?: OnboardingTemplateTaskDto[];
}

export class OnboardingStartDto {
  employeeId?: string;
  candidateName?: string;
  candidateEmail?: string;
  templateId?: string;
  startDate?: string;
}

export class OffboardingDto {
  employeeId!: string;
  type!: string;
  reason?: string;
  lastWorkingDate?: string;
}

export class OffboardingUpdateDto {
  reason?: string;
  lastWorkingDate?: string;
  exitInterviewNotes?: string;
  settlementNotes?: string;
  status?: string;
}

export class ReviewCycleDto {
  name!: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

export class ReviewDto {
  cycleId?: string;
  employeeId!: string;
  reviewerId?: string;
}

export class ReviewSubmitDto {
  overallRating?: number;
  ratings?: unknown;
  strengths?: string;
  improvements?: string;
  comments?: string;
}

export class GoalDto {
  employeeId!: string;
  cycleId?: string;
  title!: string;
  description?: string;
  targetDate?: string;
}

export class GoalUpdateDto {
  title?: string;
  description?: string;
  targetDate?: string;
  status?: string;
  progress?: number;
}

@Controller('hrms/onboarding/templates')
@UseGuards(HrmsPermissionGuard)
export class OnboardingTemplatesController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get()
  @RequirePermissions('hrms.onboarding.view')
  list(@CurrentOrganisation() org: OrganisationContextValue) {
    return this.lifecycle.listTemplates(org.organisationId);
  }

  @Post()
  @RequirePermissions('hrms.onboarding.manage')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: OnboardingTemplateDto,
  ) {
    return this.lifecycle.createTemplate(org.organisationId, {
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive,
      tasks: (dto.tasks ?? []).map((t) => ({
        title: t.title,
        description: t.description,
        category: t.category,
        assigneeRole: t.assigneeRole,
        dueDaysOffset: t.dueDaysOffset,
        sortOrder: t.sortOrder,
      })),
    });
  }

  @Patch(':id')
  @RequirePermissions('hrms.onboarding.manage')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: OnboardingTemplateDto,
  ) {
    return this.lifecycle.updateTemplate(org.organisationId, id, {
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive,
      tasks: dto.tasks
        ? dto.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            category: t.category,
            assigneeRole: t.assigneeRole,
            dueDaysOffset: t.dueDaysOffset,
            sortOrder: t.sortOrder,
          }))
        : undefined,
    });
  }

  @Delete(':id')
  @RequirePermissions('hrms.onboarding.manage')
  remove(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.lifecycle.deleteTemplate(org.organisationId, id);
  }
}

@Controller('hrms/onboarding')
@UseGuards(HrmsPermissionGuard)
export class OnboardingController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get()
  @RequirePermissions('hrms.onboarding.view')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('status') status?: string,
  ) {
    return this.lifecycle.listInstances(toCtx(org), user, { status });
  }

  @Get(':id')
  @RequirePermissions('hrms.onboarding.view')
  get(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.lifecycle.getInstance(toCtx(org), id);
  }

  @Post()
  @RequirePermissions('hrms.onboarding.manage')
  start(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: OnboardingStartDto,
  ) {
    return this.lifecycle.startOnboarding(toCtx(org), {
      employeeId: dto.employeeId,
      candidateName: dto.candidateName,
      candidateEmail: dto.candidateEmail,
      templateId: dto.templateId,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
    });
  }

  @Post(':id/convert')
  @RequirePermissions(['hrms.onboarding.manage', 'hrms.employee.create'])
  convert(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    const input = {
      ...toCtx(org),
      ...dto,
      joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    };
    return this.lifecycle.convertToEmployee(toCtx(org), user, id, input);
  }

  @Post(':id/tasks/:taskId/complete')
  @RequirePermissions('hrms.onboarding.view')
  completeTask(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.lifecycle.completeTask(toCtx(org), user, id, taskId);
  }

  @Post(':id/tasks/:taskId/reopen')
  @RequirePermissions('hrms.onboarding.view')
  reopenTask(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.lifecycle.reopenTask(toCtx(org), user, id, taskId);
  }

  @Post(':id/cancel')
  @RequirePermissions('hrms.onboarding.manage')
  cancel(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.lifecycle.cancelOnboarding(toCtx(org), id);
  }
}

@Controller('hrms/offboarding')
@UseGuards(HrmsPermissionGuard)
export class OffboardingController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get()
  @RequirePermissions('hrms.offboarding.view')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('status') status?: string,
  ) {
    return this.lifecycle.listCases(toCtx(org), user, { status });
  }

  @Post()
  @RequirePermissions('hrms.offboarding.manage')
  initiate(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: OffboardingDto,
  ) {
    return this.lifecycle.initiate(toCtx(org), {
      employeeId: dto.employeeId,
      type: dto.type,
      reason: dto.reason,
      lastWorkingDate: dto.lastWorkingDate ? new Date(dto.lastWorkingDate) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('hrms.offboarding.view')
  get(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.lifecycle.getCase(toCtx(org), id);
  }

  @Patch(':id')
  @RequirePermissions('hrms.offboarding.manage')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: OffboardingUpdateDto,
  ) {
    return this.lifecycle.updateCase(toCtx(org), id, {
      reason: dto.reason,
      lastWorkingDate: dto.lastWorkingDate ? new Date(dto.lastWorkingDate) : undefined,
      exitInterviewNotes: dto.exitInterviewNotes,
      settlementNotes: dto.settlementNotes,
      status: dto.status,
    });
  }

  @Post(':id/tasks/:taskId/complete')
  @RequirePermissions('hrms.offboarding.view')
  completeTask(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.lifecycle.completeOffboardingTask(toCtx(org), user, id, taskId);
  }

  @Post(':id/tasks/:taskId/reopen')
  @RequirePermissions('hrms.offboarding.view')
  reopenTask(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.lifecycle.reopenOffboardingTask(toCtx(org), user, id, taskId);
  }

  @Post(':id/complete')
  @RequirePermissions('hrms.offboarding.manage')
  complete(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.lifecycle.completeCase(toCtx(org), user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('hrms.offboarding.manage')
  cancel(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.lifecycle.cancelCase(toCtx(org), id);
  }
}

@Controller('hrms/performance/cycles')
@UseGuards(HrmsPermissionGuard)
export class PerformanceCyclesController {
  constructor(private readonly performance: PerformanceService) {}

  @Get()
  @RequirePermissions('hrms.performance.view')
  list(@CurrentOrganisation() org: OrganisationContextValue) {
    return this.performance.listCycles(org.organisationId);
  }

  @Post()
  @RequirePermissions('hrms.performance.manage')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: ReviewCycleDto,
  ) {
    return this.performance.createCycle(org.organisationId, {
      name: dto.name,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('hrms.performance.manage')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: ReviewCycleDto,
  ) {
    return this.performance.updateCycle(org.organisationId, id, {
      name: dto.name,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      status: dto.status,
    });
  }
}

@Controller('hrms/performance/reviews')
@UseGuards(HrmsPermissionGuard)
export class PerformanceReviewsController {
  constructor(private readonly performance: PerformanceService) {}

  @Get()
  @RequirePermissions('hrms.performance.view')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('cycleId') cycleId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.performance.listReviews(toCtx(org), user, { cycleId, employeeId });
  }

  @Post()
  @RequirePermissions('hrms.performance.manage')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: ReviewDto,
  ) {
    return this.performance.createReview(toCtx(org), {
      cycleId: dto.cycleId,
      employeeId: dto.employeeId,
      reviewerId: dto.reviewerId,
    });
  }

  @Patch(':id')
  @RequirePermissions('hrms.performance.view')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ReviewSubmitDto,
  ) {
    return this.performance.updateReview(toCtx(org), user, id, {
      overallRating: dto.overallRating,
      ratings: dto.ratings,
      strengths: dto.strengths,
      improvements: dto.improvements,
      comments: dto.comments,
    });
  }

  @Post(':id/acknowledge')
  @RequirePermissions('hrms.performance.view')
  acknowledge(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.performance.acknowledgeReview(toCtx(org), user, id);
  }
}

@Controller('hrms/goals')
@UseGuards(HrmsPermissionGuard)
export class GoalsController {
  constructor(private readonly performance: PerformanceService) {}

  @Get()
  @RequirePermissions('hrms.performance.view')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('cycleId') cycleId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.performance.listGoals(toCtx(org), user, { cycleId, employeeId });
  }

  @Post()
  @RequirePermissions('hrms.performance.view')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Body() dto: GoalDto,
  ) {
    return this.performance.createGoal(toCtx(org), user, {
      employeeId: dto.employeeId,
      cycleId: dto.cycleId,
      title: dto.title,
      description: dto.description,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('hrms.performance.view')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: GoalUpdateDto,
  ) {
    return this.performance.updateGoal(toCtx(org), user, id, {
      title: dto.title,
      description: dto.description,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      status: dto.status,
      progress: dto.progress,
    });
  }
}

@Controller('hrms/analytics')
@UseGuards(HrmsPermissionGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @RequirePermissions('hrms.analytics.view')
  get(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.analytics.getAnalytics(toCtx(org), user);
  }
}
