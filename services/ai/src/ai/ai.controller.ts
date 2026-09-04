import { Body, Controller, Post } from '@nestjs/common';
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
}

export class ConfirmActionDto {
  actionType!: string;
  payload!: Record<string, unknown>;
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
    return this.ai.extractTasks(ctx, dto.text, dto.sourceType ?? 'manual', dto.sourceId);
  }

  @Post('extract/decisions')
  async extractDecisions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ExtractDto,
  ) {
    return this.ai.extractDecisions(ctx, dto.text, dto.sourceType ?? 'manual', dto.sourceId);
  }

  @Post('actions/confirm')
  async confirmAction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.ai.confirmAction(ctx, dto.actionType, dto.payload);
  }
}
