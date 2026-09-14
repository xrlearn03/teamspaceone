import { BadRequestException, Body, Controller, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { MeetingService } from './meeting.service.js';

@Controller('meetings/internal')
export class InternalMeetingController {
  constructor(private readonly meeting: MeetingService) {}

  @Post(':id/room')
  async createRoom(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: { title: string },
  ) {
    if (!dto.title) {
      throw new BadRequestException('Title is required');
    }
    return this.meeting.createInterviewRoom(ctx.organisationId, id, dto.title);
  }

  @Post(':id/sfu-token')
  async getSfuToken(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: { userId: string; displayName?: string },
  ) {
    if (!dto.userId) {
      throw new BadRequestException('userId is required');
    }
    return this.meeting.getSfuTokenForInterview(ctx.organisationId, id, dto.userId, dto.displayName);
  }
}
