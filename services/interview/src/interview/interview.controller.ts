import {
  Body,
  Controller,
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
import {
  CurrentUser,
  InterviewPermissionGuard,
  RequirePermissions,
} from './permission.guard.js';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import {
  InterviewService,
  type CreateCandidateInput,
  type CreateEvaluationInput,
  type CreateJobInput,
  type CreateSessionInput,
} from './interview.service.js';

@UseGuards(InterviewPermissionGuard)
@Controller('interview')
export class InterviewController {
  constructor(private readonly interview: InterviewService) {}

  @Get('overview')
  @RequirePermissions(
    ['interview.job.view', 'interview.candidate.view', 'interview.interview.view'],
    false,
  )
  overview(@CurrentOrganisation() ctx: OrganisationContextValue, @CurrentUser() user: AuthorizableUser) {
    return this.interview.getOverview(ctx.organisationId, user);
  }

  @Get('jobs')
  @RequirePermissions('interview.job.view')
  listJobs(@CurrentOrganisation() ctx: OrganisationContextValue, @CurrentUser() user: AuthorizableUser, @Query('status') status?: string) {
    return this.interview.listJobs(ctx.organisationId, user, status);
  }

  @Post('jobs')
  @RequirePermissions('interview.job.create')
  createJob(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateJobInput) {
    return this.interview.createJob(ctx.organisationId, ctx.actorId as string, dto);
  }

  @Patch('jobs/:id')
  @RequirePermissions('interview.job.edit')
  updateJob(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateJobInput> & { status?: string },
  ) {
    return this.interview.updateJob(ctx.organisationId, user, id, dto);
  }

  @Get('candidates')
  @RequirePermissions('interview.candidate.view')
  listCandidates(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('status') status?: string,
  ) {
    return this.interview.listCandidates(ctx.organisationId, user, status);
  }

  @Post('candidates')
  @RequirePermissions('interview.candidate.create')
  createCandidate(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateCandidateInput) {
    return this.interview.createCandidate(ctx.organisationId, dto);
  }

  @Patch('applications/:id/stage')
  @RequirePermissions('interview.candidate.edit')
  updateApplicationStage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: { stage: string },
  ) {
    return this.interview.updateApplicationStage(ctx.organisationId, user, id, dto.stage);
  }

  @Get('sessions')
  @RequirePermissions('interview.interview.view')
  listSessions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('upcoming') upcoming?: string,
  ) {
    return this.interview.listSessions(ctx.organisationId, user, upcoming === 'true');
  }

  @Post('sessions')
  @RequirePermissions('interview.interview.schedule')
  createSession(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateSessionInput) {
    return this.interview.createSession(ctx.organisationId, ctx.actorId as string, dto);
  }

  @Get('evaluations/pending')
  @RequirePermissions(['interview.interview.evaluate', 'interview.decision.view'], false)
  listPendingEvaluations(@CurrentOrganisation() ctx: OrganisationContextValue, @CurrentUser() user: AuthorizableUser) {
    return this.interview.listPendingEvaluations(ctx.organisationId, user);
  }

  @Post('sessions/:id/evaluations')
  @RequirePermissions('interview.interview.evaluate')
  submitEvaluation(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: CreateEvaluationInput,
  ) {
    return this.interview.submitEvaluation(ctx.organisationId, id, ctx.actorId as string, dto);
  }
}
