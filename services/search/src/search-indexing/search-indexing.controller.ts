import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { SearchIndexingService, type ReindexJob } from './search-indexing.service.js';

class ReindexDto implements ReindexJob {
  eventType!: string;
  organisationId!: string;
  workspaceId?: string;
  actorId?: string;
  resourceType!: string;
  resourceId!: string;
  payload!: Record<string, unknown>;
  correlationId?: string;
}

@Controller('search')
export class SearchIndexingController {
  constructor(private readonly indexingService: SearchIndexingService) {}

  @Post('reindex')
  async reindex(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ReindexDto,
  ) {
    return this.indexingService.enqueue({
      ...dto,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      workspaceId: dto.workspaceId ?? ctx.workspaceId,
      correlationId: ctx.correlationId,
    });
  }
}
