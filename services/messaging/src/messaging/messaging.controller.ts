import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { MessagingService } from './messaging.service.js';
import { type CreateChannelDto } from './dto/create-channel.dto.js';
import { type CreateDirectChannelDto } from './dto/create-direct-channel.dto.js';
import { type CreateMessageDto } from './dto/create-message.dto.js';
import { type UpdateChannelDto } from './dto/update-channel.dto.js';
import { type UpdateChannelMembersDto } from './dto/update-channel-members.dto.js';
import { type UpdateMessageDto } from './dto/update-message.dto.js';

@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('channels/:id/access')
  resolveAccess(@Param('id') channelId: string, @Headers('x-actor-id') actorId?: string) {
    if (!actorId) return null;
    return this.messaging.resolveAccess(channelId, actorId);
  }

  @Get('channels')
  listChannels(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.messaging.listChannels(ctx);
  }

  @Post('channels')
  createChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateChannelDto,
  ) {
    return this.messaging.createChannel(ctx, dto);
  }

  @Post('channels/direct')
  createDirectChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateDirectChannelDto,
  ) {
    return this.messaging.createDirectChannel(ctx, dto);
  }

  @Patch('channels/:id')
  updateChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.messaging.updateChannel(ctx, channelId, dto);
  }

  @Put('channels/:id/members')
  replaceMembers(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelMembersDto,
  ) {
    return this.messaging.replaceMembers(ctx, channelId, dto.memberIds);
  }

  @Delete('channels/:id')
  async deleteChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
  ) {
    await this.messaging.deleteChannel(ctx, channelId);
  }

  @Get('channels/:id/messages')
  listMessages(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messaging.listMessages(ctx, channelId, cursor, limit ? Number(limit) : 50);
  }

  @Get('messages/:id/thread')
  listThreadMessages(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messaging.listThreadMessages(ctx, messageId, cursor, limit ? Number(limit) : 50);
  }

  @Post('messages')
  createMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messaging.createMessage(ctx, dto);
  }

  @Patch('messages/:id')
  updateMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messaging.updateMessage(ctx, messageId, dto);
  }

  @Post('messages/:id/reactions')
  toggleReaction(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
    @Body() dto: { emoji: string },
  ) {
    return this.messaging.toggleReaction(ctx, messageId, dto.emoji);
  }

  @Delete('messages/:id')
  deleteMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') messageId: string,
  ) {
    return this.messaging.deleteMessage(ctx, messageId);
  }
}
