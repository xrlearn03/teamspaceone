import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { AiService } from './ai.service.js';

export class SummarizeDto {
  prompt!: string;
  sourceText?: string;
}

export class AskDto {
  question!: string;
  workspaceId?: string;
  resourceTypes?: string[];
  limit?: number;
}

export class ExtractDto {
  text!: string;
  sourceType?: string;
  sourceId?: string;
  projectId?: string;
  autoCreate?: boolean;
}

export class DailyDigestDto {
  workspaceId?: string;
  hours?: number;
}

export class ConfirmActionDto {
  id!: string;
  edits?: Record<string, unknown>;
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('summarize')
  async summarize(
    @CurrentOrganisation() _ctx: OrganisationContextValue,
    @Body() dto: SummarizeDto,
  ) {
    return this.ai.summarize(dto.prompt, dto.sourceText);
  }

  @Post('ask')
  async ask(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: AskDto,
  ) {
    return this.ai.ask(ctx, dto.question, {
      workspaceId: dto.workspaceId,
      resourceTypes: dto.resourceTypes,
      limit: dto.limit,
    });
  }

  @Post('extract/tasks')
  async extractTasks(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ExtractDto,
  ) {
    return this.ai.extractTasks(ctx, dto.text, dto.sourceType ?? 'manual', dto.sourceId, { projectId: dto.projectId, autoCreate: dto.autoCreate });
  }

  @Post('extract/decisions')
  async extractDecisions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ExtractDto,
  ) {
    return this.ai.extractDecisions(ctx, dto.text, dto.sourceType ?? 'manual', dto.sourceId);
  }

  @Post('daily-digest')
  async dailyDigest(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: DailyDigestDto,
  ) {
    return this.ai.dailyDigest(ctx, dto.workspaceId, dto.hours);
  }

  @Get('actions/pending')
  async listPendingActions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.ai.listPendingActions(ctx, {
      workspaceId,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Post('actions/:id/confirm')
  async confirmAction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.ai.confirmAction(ctx, id, dto.edits);
  }

  @Post('actions/:id/decline')
  async declineAction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.ai.declineAction(ctx, id);
  }
}
