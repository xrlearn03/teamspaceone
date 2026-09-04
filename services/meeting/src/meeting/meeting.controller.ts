import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { MeetingService } from './meeting.service.js';
import { type CreateMeetingDto } from './dto/create-meeting.dto.js';
import { type CreateVoiceRoomDto } from './dto/create-voice-room.dto.js';
import { type JoinMeetingDto } from './dto/join-meeting.dto.js';
import { type UpdateScreenShareDto } from './dto/update-screen-share.dto.js';
import { type CreateMeetingMessageDto } from './dto/create-meeting-message.dto.js';
import { type CreateMeetingReactionDto } from './dto/create-meeting-reaction.dto.js';
import { type UpdateMeetingRaiseHandDto } from './dto/update-meeting-raise-hand.dto.js';
import { type UpdateMeetingRecordingDto } from './dto/update-meeting-recording.dto.js';

@Controller('meetings')
export class MeetingController {
  constructor(private readonly meeting: MeetingService) {}

  @Get(':id/access')
  resolveAccess(@Param('id') meetingId: string, @Headers('x-actor-id') actorId?: string) {
    if (!actorId) return null;
    return this.meeting.resolveAccess(meetingId, actorId);
  }

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

  @Post(':id/messages')
  async createMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: CreateMeetingMessageDto,
  ) {
    return this.meeting.createMeetingMessage(ctx, id, dto.content);
  }

  @Get(':id/messages')
  async listMessages(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.meeting.listMeetingMessages(ctx, id, cursor, limit ? Number(limit) : 50);
  }

  @Post(':id/reactions')
  async createReaction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: CreateMeetingReactionDto,
  ) {
    return this.meeting.createMeetingReaction(ctx, id, dto.emoji);
  }

  @Get(':id/reactions')
  async listReactions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.listMeetingReactions(ctx, id);
  }

  @Post(':id/raise-hand')
  async updateRaiseHand(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingRaiseHandDto,
  ) {
    return this.meeting.updateRaiseHand(ctx, id, dto.raised);
  }

  @Get(':id/raise-hands')
  async listRaiseHands(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.listRaiseHands(ctx, id);
  }

  @Post(':id/recording')
  async setRecording(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingRecordingDto,
  ) {
    return this.meeting.setRecording(ctx, id, dto.recording);
  }
}
