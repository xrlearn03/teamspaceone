import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { DeadLetterService } from './dead-letter.service.js';

@Controller('audit/dead-letters')
export class DeadLetterController {
  constructor(private readonly deadLetter: DeadLetterService) {}

  @Get()
  list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.deadLetter.list(ctx.organisationId);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.deadLetter.retry(id);
  }
}
