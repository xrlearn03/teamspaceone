import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
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
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type ScreenInput,
  type ReviewScreeningInput,
  type AiStartInput,
  type AiAnswerInput,
  type ReviewEvaluationInput,
  type MakeDecisionInput,
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

  @Patch('candidates/:id')
  @RequirePermissions('interview.candidate.edit')
  updateCandidate(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: { resumeFileId?: string | null },
  ) {
    return this.interview.updateCandidate(ctx.organisationId, user, id, dto);
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

  @Post('applications/:id/screen')
  @RequirePermissions('interview.screening.run')
  screenApplication(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ScreenInput,
  ) {
    return this.interview.screenApplication(ctx, user, id, dto);
  }

  @Get('applications/:id/screening')
  @RequirePermissions('interview.screening.view')
  getScreening(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.interview.getScreening(ctx, user, id);
  }

  @Post('applications/:id/screening/review')
  @RequirePermissions('interview.interview.approve')
  reviewScreening(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ReviewScreeningInput,
  ) {
    return this.interview.reviewScreening(ctx, user, id, dto);
  }

  @Get('templates')
  @RequirePermissions('interview.template.view')
  listTemplates(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.interview.listTemplates(ctx, user);
  }

  @Post('templates')
  @RequirePermissions('interview.template.create')
  createTemplate(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateTemplateInput,
  ) {
    return this.interview.createTemplate(ctx, dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('interview.template.edit')
  updateTemplate(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateInput,
  ) {
    return this.interview.updateTemplate(ctx, user, id, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions('interview.template.delete')
  deleteTemplate(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.interview.deleteTemplate(ctx, user, id);
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

  @Post('sessions/:id/ai/start')
  @RequirePermissions('interview.interview.conduct')
  startAiInterview(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: AiStartInput,
  ) {
    return this.interview.startAiInterview(ctx, user, id, dto);
  }

  @Post('sessions/:id/ai/answer')
  @RequirePermissions('interview.interview.conduct')
  answerAiQuestion(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: AiAnswerInput,
  ) {
    return this.interview.answerAiQuestion(ctx, user, id, dto);
  }

  @Get('sessions/:id/ai/transcript')
  @RequirePermissions('interview.interview.view')
  getTranscript(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.interview.getTranscript(ctx, user, id);
  }

  @Get('sessions/:id/calendar.ics')
  @RequirePermissions('interview.interview.view')
  async getCalendarIcs(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const { ics, fileName } = await this.interview.calendarIcs(ctx.organisationId, id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(ics);
  }

  @Post('sessions/:id/ai/join')
  @RequirePermissions('interview.interview.conduct')
  joinAiInterview(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.interview.joinAiInterview(ctx, id, user.id);
  }

  @Post('sessions/:id/ai/evaluate')
  @RequirePermissions('interview.interview.evaluate')
  evaluateAiInterview(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.interview.evaluateAiInterview(ctx, user, id);
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

  @Get('sessions/:id/evaluations')
  @RequirePermissions('interview.interview.view')
  listSessionEvaluations(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.interview.listSessionEvaluations(ctx, user, id);
  }

  @Post('evaluations/:id/review')
  @RequirePermissions('interview.interview.edit-evaluation')
  reviewEvaluation(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ReviewEvaluationInput,
  ) {
    return this.interview.reviewEvaluation(ctx, user, id, dto);
  }

  @Post('applications/:id/decision')
  @RequirePermissions('interview.decision.make')
  makeHiringDecision(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: MakeDecisionInput,
  ) {
    return this.interview.makeHiringDecision(ctx, user, id, dto);
  }

  @Get('decisions')
  @RequirePermissions('interview.decision.view')
  listHiringDecisions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.interview.listHiringDecisions(ctx, user);
  }
}
