import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { SearchService } from './search.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';

const MAX_LIMIT = 100;

function parseIntParam(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || Number.isNaN(n)) {
    throw new BadRequestException(`${name} must be an integer`);
  }
  return n;
}

function parseDateParam(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${name} must be an ISO 8601 date string`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${name} is not a parseable date`);
  }
  return d.toISOString();
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query() query: SearchQueryDto,
  ) {
    const rawLimit = parseIntParam(query.limit, 'limit');
    const rawOffset = parseIntParam(query.offset, 'offset');
    if (rawLimit !== undefined && rawLimit < 1) {
      throw new BadRequestException('limit must be >= 1');
    }
    if (rawOffset !== undefined && rawOffset < 0) {
      throw new BadRequestException('offset must be >= 0');
    }
    const limit = rawLimit === undefined ? undefined : Math.min(rawLimit, MAX_LIMIT);
    const from = parseDateParam(query.from, 'from');
    const to = parseDateParam(query.to, 'to');

    return this.searchService.search(ctx, query.q ?? '', {
      resourceType: query.type,
      workspaceId: query.workspaceId,
      authorId: query.authorId,
      from,
      to,
      limit,
      offset: rawOffset,
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
