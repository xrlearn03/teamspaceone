import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { COLLABORATION_PERMISSIONS, type AuthorizableUser } from '@teamspace-one/authorization';
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

function parseStringParam(value: unknown, name: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be a string`);
  const result = value.trim();
  if (result.length > maxLength) throw new BadRequestException(`${name} must be at most ${maxLength} characters`);
  return result;
}

function parseStringArrayParam(value: unknown, name: string, maxItems: number, maxLength: number): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length > maxItems) throw new BadRequestException(`${name} must contain at most ${maxItems} values`);
  return values.map((item) => {
    const parsed = parseStringParam(item, name, maxLength);
    if (!parsed) throw new BadRequestException(`${name} values must not be empty`);
    return parsed;
  });
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

@UseGuards(RemotePermissionGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async search(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query() query: SearchQueryDto,
    @Req() req: { user?: AuthorizableUser },
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
    if (from && to && from > to) throw new BadRequestException('from must be before or equal to to');
    const q = parseStringParam(query.q, 'q', 500) ?? '';

    return this.searchService.search(ctx, q, {
      resourceTypes: parseStringArrayParam(query.type, 'type', 20, 100),
      workspaceId: parseStringParam(query.workspaceId, 'workspaceId', 200),
      authorId: parseStringParam(query.authorId, 'authorId', 200),
      from,
      to,
      limit,
      offset: rawOffset,
    }, req.user);
  }

  @Get(':resourceType/:resourceId')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async getByResource(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Req() req: { user?: AuthorizableUser },
  ) {
    return this.searchService.getByResource(ctx, resourceType, resourceId, req.user);
  }
}
