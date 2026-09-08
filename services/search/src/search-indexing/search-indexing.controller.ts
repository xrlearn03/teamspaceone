import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { ADMIN_PERMISSIONS } from '@teamspace-one/authorization';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { NatsConsumerService } from '../events/nats-consumer.service.js';
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

@UseGuards(RemotePermissionGuard)
@Controller('search')
export class SearchIndexingController {
  constructor(
    private readonly indexingService: SearchIndexingService,
    private readonly consumerService: NatsConsumerService,
  ) {}

  @Post('backfill')
  @RequirePermissions(ADMIN_PERMISSIONS.AUDIT_VIEW)
  backfill() {
    return this.consumerService.backfill();
  }

  @Post('reindex')
  @RequirePermissions(ADMIN_PERMISSIONS.AUDIT_VIEW)
  async reindex(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ReindexDto,
  ) {
    if (!dto.eventType || !dto.resourceType || !dto.resourceId || !dto.payload || typeof dto.payload !== 'object') {
      throw new BadRequestException('eventType, resourceType, resourceId, and payload are required');
    }
    return this.indexingService.enqueue({
      ...dto,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      workspaceId: dto.workspaceId ?? ctx.workspaceId,
      correlationId: ctx.correlationId,
    });
  }
}
