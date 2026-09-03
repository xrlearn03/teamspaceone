import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { SearchService } from './search.service.js';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('q') query?: string,
  ) {
    return this.searchService.search(ctx, query ?? '');
  }
}
