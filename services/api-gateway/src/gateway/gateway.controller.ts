import { Body, Controller, Headers, Post } from '@nestjs/common';
import { OrganisationContext, CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { GatewayService } from './gateway.service.js';

export interface PublishEventDto {
  subject: string;
  payload: unknown;
}

@Controller('gateway')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Post('publish')
  async publish(
    @CurrentOrganisation() organisation: OrganisationContextValue,
    @Body() dto: PublishEventDto,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-actor-id') actorId?: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.gatewayService.publishEvent({
      ...organisation,
      correlationId: correlationId ?? organisation.correlationId,
      actorId: actorId ?? organisation.actorId,
      workspaceId: workspaceId ?? organisation.workspaceId,
      subject: dto.subject,
      payload: dto.payload,
    });
  }

  @Post('echo')
  echo(@CurrentOrganisation() organisation: OrganisationContextValue): OrganisationContextValue {
    return organisation;
  }
}
