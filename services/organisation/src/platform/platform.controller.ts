import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformService } from './platform.service.js';

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;

function parsePage(query: { take?: string; skip?: string }) {
  const take = Math.min(Math.max(parseInt(query.take ?? '', 10) || DEFAULT_TAKE, 1), MAX_TAKE);
  const skip = Math.max(parseInt(query.skip ?? '', 10) || 0, 0);
  return { take, skip };
}

/**
 * Platform-level administration endpoints. Only reachable by members of the
 * dedicated platform organisation holding `admin.system.settings` — enforced
 * by PlatformAdminGuard against the caller's organisation context headers.
 */
@UseGuards(PlatformAdminGuard)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('organisations')
  listOrganisations(
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.platform.listOrganisations({ search: search?.trim() || undefined, ...parsePage({ take, skip }) });
  }

  @Get('organisations/:id')
  getOrganisation(@Param('id') id: string) {
    return this.platform.getOrganisation(id);
  }

  @Get('organisations/:id/members')
  listMembers(
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.platform.listMembers(id, parsePage({ take, skip }));
  }

  @Get('organisations/:id/invitations')
  listInvitations(@Param('id') id: string) {
    return this.platform.listInvitations(id);
  }
}
