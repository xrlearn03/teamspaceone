import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { MeetingService } from './meeting.service.js';
import { type CreateMeetingDto } from './dto/create-meeting.dto.js';
import { type CreateVoiceRoomDto } from './dto/create-voice-room.dto.js';
import { type JoinMeetingDto } from './dto/join-meeting.dto.js';
import { type UpdateScreenShareDto } from './dto/update-screen-share.dto.js';

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

  @Post('voice-rooms')
  async createVoiceRoom(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateVoiceRoomDto,
  ) {
    return this.meeting.createVoiceRoom(ctx, dto);
  }

  @Get()
  async list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.meeting.list(ctx);
  }

  @Get(':id')
  async getById(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.getById(ctx, id);
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

  @Post(':id/join')
  async join(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: JoinMeetingDto,
  ) {
    return this.meeting.join(ctx, id, dto);
  }

  @Post(':id/leave')
  async leave(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.leave(ctx, id);
  }

  @Post(':id/screen-share')
  async setScreenShare(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateScreenShareDto,
  ) {
    return this.meeting.setScreenShare(ctx, id, dto.isScreenSharing);
  }

  @Get(':id/token')
  async getToken(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.getToken(ctx, id);
  }
}
