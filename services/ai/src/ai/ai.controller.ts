import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { AiService } from './ai.service.js';

export class SummarizeDto {
  prompt!: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('summarize')
  async summarize(
    @CurrentOrganisation() _ctx: OrganisationContextValue,
    @Body() dto: SummarizeDto,
  ) {
    return this.ai.summarize(dto.prompt);
  }
}
