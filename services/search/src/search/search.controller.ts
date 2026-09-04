import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { SearchService } from './search.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query() query: SearchQueryDto,
  ) {
    return this.searchService.search(ctx, query.q ?? '', {
      resourceType: query.type,
      workspaceId: query.workspaceId,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }

  @Get(':resourceType/:resourceId')
  async getByResource(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.searchService.getByResource(ctx, resourceType, resourceId);
  }
}
