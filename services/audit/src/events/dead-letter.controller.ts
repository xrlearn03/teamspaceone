import { Controller, ForbiddenException, Get, Headers, Param, Post } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { DeadLetterService } from './dead-letter.service.js';

function requireInternalCaller(caller: string | undefined): void {
  // The API gateway strips x-internal-caller from inbound requests, so its
  // presence (combined with the internal API key enforced by middleware)
  // proves this is a service-to-service call.
  if (typeof caller !== 'string' || caller.length === 0) {
    throw new ForbiddenException('Dead-letter operations are restricted to internal service callers');
  }
}

@Controller('audit/dead-letters')
export class DeadLetterController {
  constructor(private readonly deadLetter: DeadLetterService) {}

  @Get()
  list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.deadLetter.list(ctx.organisationId);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string, @Headers('x-internal-caller') caller?: string) {
    requireInternalCaller(caller);
    return this.deadLetter.retry(id);
  }
}
