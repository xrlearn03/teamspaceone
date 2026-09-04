import { Body, Controller, Post } from '@nestjs/common';
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
  ) {
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
