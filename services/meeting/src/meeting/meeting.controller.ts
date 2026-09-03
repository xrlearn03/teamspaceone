import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { MeetingService } from './meeting.service.js';
import { type CreateMeetingDto } from './dto/create-meeting.dto.js';

@Controller('meetings')
export class MeetingController {
  constructor(private readonly meeting: MeetingService) {}

  @Post()
  async create(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meeting.create(ctx, dto);
  }

  @Get()
  async list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.meeting.list(ctx);
  }

  @Post(':id/start')
  async start(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.start(ctx, id);
  }

  @Post(':id/end')
  async end(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.end(ctx, id);
  }
}
