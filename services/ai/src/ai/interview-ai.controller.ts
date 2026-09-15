import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { INTERVIEW_PERMISSIONS } from '@teamspace-one/authorization';
import { AiService } from './ai.service.js';

export class CandidateDto {
  name!: string;
  email?: string;
}

export class JobDto {
  title!: string;
  description?: string;
  requirements?: string;
}

export class QuestionConfigDto {
  count?: number;
  difficulty?: string;
  categories?: string[];
}

export class TranscriptEntryDto {
  question!: string;
  answer!: string;
}

export class ScreenDto {
  resumeText!: string;
  candidate!: CandidateDto;
  job!: JobDto;
}

export class QuestionsDto {
  job!: JobDto;
  config!: QuestionConfigDto;
  transcript?: TranscriptEntryDto[];
}

export class EvaluateDto {
  job!: JobDto;
  transcript!: TranscriptEntryDto[];
  criteria?: string[];
}

export class SpeakDto {
  text!: string;
  voiceId?: string;
}

@UseGuards(RemotePermissionGuard)
@Controller('ai')
export class InterviewAiController {
  constructor(private readonly ai: AiService) {}

  @Post('interview/screen')
  @RequirePermissions(INTERVIEW_PERMISSIONS.SCREENING_RUN)
  async screen(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: ScreenDto) {
    return this.ai.screenCandidate(ctx, dto);
  }

  @Post('interview/questions')
  @RequirePermissions(INTERVIEW_PERMISSIONS.INTERVIEW_CONDUCT)
  async questions(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: QuestionsDto) {
    return this.ai.generateQuestions(ctx, { ...dto, config: dto.config ?? {} });
  }

  @Post('interview/evaluate')
  @RequirePermissions(INTERVIEW_PERMISSIONS.INTERVIEW_EVALUATE)
  async evaluate(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: EvaluateDto) {
    return this.ai.evaluateInterview(ctx, dto);
  }

  @Post('interview/speak')
  @RequirePermissions(INTERVIEW_PERMISSIONS.INTERVIEW_CONDUCT)
  async speak(@CurrentOrganisation() _ctx: OrganisationContextValue, @Body() dto: SpeakDto) {
    return this.ai.speak(dto.text, dto.voiceId);
  }
}
