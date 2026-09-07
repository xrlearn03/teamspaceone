import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { COLLABORATION_PERMISSIONS } from '@teamspace-one/authorization';
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

@UseGuards(RemotePermissionGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('summarize')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async summarize(
    @CurrentOrganisation() _ctx: OrganisationContextValue,
    @Body() dto: SummarizeDto,
  ) {
    return this.ai.summarize(dto.prompt, dto.sourceText);
  }

  @Post('ask')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
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
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async extractTasks(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ExtractDto,
  ) {
    return this.ai.extractTasks(ctx, dto.text, dto.sourceType ?? 'manual', dto.sourceId, { projectId: dto.projectId, autoCreate: dto.autoCreate });
  }

  @Post('extract/decisions')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async extractDecisions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ExtractDto,
  ) {
    return this.ai.extractDecisions(ctx, dto.text, dto.sourceType ?? 'manual', dto.sourceId);
  }

  @Post('daily-digest')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async dailyDigest(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: DailyDigestDto,
  ) {
    return this.ai.dailyDigest(ctx, dto.workspaceId, dto.hours);
  }

  @Get('actions/pending')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
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
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async confirmAction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.ai.confirmAction(ctx, id, dto.edits);
  }

  @Post('actions/:id/decline')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async declineAction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.ai.declineAction(ctx, id);
  }
}
