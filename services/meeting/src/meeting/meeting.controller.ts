import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { COLLABORATION_PERMISSIONS } from '@teamspace-one/authorization';
import { MeetingService } from './meeting.service.js';
import { type CreateMeetingDto } from './dto/create-meeting.dto.js';
import { type CreateVoiceRoomDto } from './dto/create-voice-room.dto.js';
import { type JoinMeetingDto } from './dto/join-meeting.dto.js';
import { type UpdateScreenShareDto } from './dto/update-screen-share.dto.js';
import { type CreateMeetingMessageDto } from './dto/create-meeting-message.dto.js';
import { type CreateMeetingReactionDto } from './dto/create-meeting-reaction.dto.js';
import { type UpdateMeetingRaiseHandDto } from './dto/update-meeting-raise-hand.dto.js';
import { type UpdateMeetingRecordingDto } from './dto/update-meeting-recording.dto.js';

@UseGuards(RemotePermissionGuard)
@Controller('meetings')
export class MeetingController {
  constructor(private readonly meeting: MeetingService) {}

  @Get(':id/access')
  resolveAccess(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') meetingId: string,
    @Headers('x-actor-id') actorId?: string,
  ) {
    if (!actorId) return null;
    return this.meeting.resolveAccess(meetingId, actorId, ctx.organisationId);
  }

  @Post()
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CREATE)
  async create(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meeting.create(ctx, dto);
  }

  @Post('voice-rooms')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CREATE)
  async createVoiceRoom(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateVoiceRoomDto,
  ) {
    return this.meeting.createVoiceRoom(ctx, dto);
  }

  @Get()
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.meeting.list(ctx);
  }

  @Get('calendar/events')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async listCalendarEvents(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.meeting.listCalendarEvents(ctx, from, to);
  }

  @Get('calendar/availability')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async listAvailability(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('userIds') userIds?: string | string[],
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const ids = Array.isArray(userIds) ? userIds : userIds ? userIds.split(',') : [];
    return this.meeting.listAvailability(ctx, ids, from, to);
  }

  @Get('code/:code')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async getByCode(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('code') code: string,
  ) {
    return this.meeting.getByCode(ctx, code);
  }

  @Get(':id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async getById(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.getById(ctx, id);
  }

  @Post(':id/start')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async start(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.start(ctx, id);
  }

  @Post(':id/end')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async end(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.end(ctx, id);
  }

  @Post(':id/join')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async join(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: JoinMeetingDto,
  ) {
    return this.meeting.join(ctx, id, dto);
  }

  @Post(':id/leave')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async leave(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.leave(ctx, id);
  }

  @Post(':id/screen-share')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async setScreenShare(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateScreenShareDto,
  ) {
    return this.meeting.setScreenShare(ctx, id, dto.isScreenSharing);
  }

  @Post(':id/share-link')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async shareLink(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.createShareLink(ctx, id);
  }

  @Post(':id/sfu-token')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async getSfuToken(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.getSfuToken(ctx, id);
  }

  @Post(':id/messages')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async createMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: CreateMeetingMessageDto,
  ) {
    return this.meeting.createMeetingMessage(ctx, id, dto.content);
  }

  @Get(':id/messages')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async listMessages(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.meeting.listMeetingMessages(ctx, id, cursor, limit ? Number(limit) : 50);
  }

  @Post(':id/reactions')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async createReaction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: CreateMeetingReactionDto,
  ) {
    return this.meeting.createMeetingReaction(ctx, id, dto.emoji);
  }

  @Get(':id/reactions')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async listReactions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.listMeetingReactions(ctx, id);
  }

  @Post(':id/raise-hand')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async updateRaiseHand(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingRaiseHandDto,
  ) {
    return this.meeting.updateRaiseHand(ctx, id, dto.raised);
  }

  @Get(':id/raise-hands')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_VIEW)
  async listRaiseHands(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.meeting.listRaiseHands(ctx, id);
  }

  @Post(':id/recording')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_CONDUCT)
  async setRecording(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingRecordingDto,
  ) {
    return this.meeting.setRecording(ctx, id, dto.recording);
  }

  @Delete('ended')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MEETING_DELETE)
  async deleteEnded(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.meeting.deleteEnded(ctx, workspaceId);
  }
}
