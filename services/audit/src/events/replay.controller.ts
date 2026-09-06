import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { ReplayService, type ReplayInput } from './replay.service.js';

export class ReplayDto {
  stream!: string;
  subject!: string;
  from!: string;
  to!: string;
  targetSubject?: string;
}

@Controller('audit/replay')
export class ReplayController {
  constructor(private readonly replayService: ReplayService) {}

  @Post()
  async replay(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ReplayDto,
    @Headers('x-internal-caller') caller?: string,
  ) {
    // The API gateway strips x-internal-caller from inbound requests, so its
    // presence (combined with the internal API key enforced by middleware)
    // proves this is a service-to-service call.
    if (typeof caller !== 'string' || caller.length === 0) {
      throw new ForbiddenException('Replay is restricted to internal service callers');
    }

    const input: ReplayInput = {
      stream: dto.stream,
      subject: dto.subject,
      from: dto.from,
      to: dto.to,
      targetSubject: dto.targetSubject,
      organisationId: ctx.organisationId,
    };

    return this.replayService.replay(input);
  }
}
