import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard } from '@teamspace-one/authorization/nest';
import { TimeEntriesService } from './time-entries.service.js';
import { type CreateTimeEntryDto } from './dto/create-time-entry.dto.js';
import { type UpdateTimeEntryDto } from './dto/update-time-entry.dto.js';

@UseGuards(RemotePermissionGuard)
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntries: TimeEntriesService) {}

  @Get()
  list(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.timeEntries.list(ctx, from, to);
  }

  @Post()
  create(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateTimeEntryDto) {
    return this.timeEntries.create(ctx, dto);
  }

  @Patch(':id')
  update(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') entryId: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.timeEntries.update(ctx, entryId, dto);
  }

  @Delete(':id')
  async remove(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') entryId: string) {
    await this.timeEntries.remove(ctx, entryId);
  }
}
