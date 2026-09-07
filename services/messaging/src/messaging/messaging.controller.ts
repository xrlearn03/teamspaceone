import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { COLLABORATION_PERMISSIONS } from '@teamspace-one/authorization';
import { MessagingService } from './messaging.service.js';
import { type CreateChannelDto } from './dto/create-channel.dto.js';
import { type CreateDirectChannelDto } from './dto/create-direct-channel.dto.js';
import { type CreateMessageDto } from './dto/create-message.dto.js';
import { type UpdateChannelDto } from './dto/update-channel.dto.js';
import { type UpdateChannelMembersDto } from './dto/update-channel-members.dto.js';
import { type UpdateMessageDto } from './dto/update-message.dto.js';

@UseGuards(RemotePermissionGuard)
@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('channels/:id/access')
  resolveAccess(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
    @Headers('x-actor-id') actorId?: string,
  ) {
    if (!actorId) return null;
    return this.messaging.resolveAccess(channelId, actorId, ctx.organisationId);
  }

  @Get('channels')
  @RequirePermissions(COLLABORATION_PERMISSIONS.CHANNEL_VIEW)
  listChannels(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.messaging.listChannels(ctx);
  }

  @Post('channels')
  @RequirePermissions(COLLABORATION_PERMISSIONS.CHANNEL_CREATE)
  createChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateChannelDto,
  ) {
    return this.messaging.createChannel(ctx, dto);
  }

  @Post('channels/direct')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MESSAGE_SEND)
  createDirectChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateDirectChannelDto,
  ) {
    return this.messaging.createDirectChannel(ctx, dto);
  }

  @Patch('channels/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.CHANNEL_MANAGE)
  updateChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.messaging.updateChannel(ctx, channelId, dto);
  }

  @Put('channels/:id/members')
  @RequirePermissions(COLLABORATION_PERMISSIONS.CHANNEL_MANAGE)
  replaceMembers(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelMembersDto,
  ) {
    return this.messaging.replaceMembers(ctx, channelId, dto.memberIds);
  }

  @Delete('channels/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.CHANNEL_DELETE)
  async deleteChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
  ) {
    await this.messaging.deleteChannel(ctx, channelId);
  }

  @Get('channels/:id/messages')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MESSAGE_VIEW)
  listMessages(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messaging.listMessages(ctx, channelId, cursor, limit ? Number(limit) : 50);
  }

  @Get('messages/:id/thread')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MESSAGE_VIEW)
  listThreadMessages(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messaging.listThreadMessages(ctx, messageId, cursor, limit ? Number(limit) : 50);
  }

  @Post('messages')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MESSAGE_SEND)
  createMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messaging.createMessage(ctx, dto);
  }

  @Patch('messages/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MESSAGE_EDIT)
  updateMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messaging.updateMessage(ctx, messageId, dto);
  }

  @Post('messages/:id/reactions')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MESSAGE_SEND)
  toggleReaction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
    @Body() dto: { emoji: string },
  ) {
    return this.messaging.toggleReaction(ctx, messageId, dto.emoji);
  }

  @Delete('messages/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.MESSAGE_DELETE)
  deleteMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
  ) {
    return this.messaging.deleteMessage(ctx, messageId);
  }
}
