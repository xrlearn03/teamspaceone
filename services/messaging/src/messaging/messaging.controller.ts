import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { MessagingService } from './messaging.service.js';
import { type CreateChannelDto } from './dto/create-channel.dto.js';
import { type CreateMessageDto } from './dto/create-message.dto.js';

@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('channels')
  async listChannels(
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    return this.messaging.listChannels(ctx);
  }

  @Post('channels')
  async createChannel(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateChannelDto,
  ) {
    return this.messaging.createChannel(ctx, dto);
  }

  @Get('channels/:id/messages')
  async listMessages(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') channelId: string,
  ) {
    return this.messaging.listMessages(ctx, channelId);
  }

  @Post('messages')
  async createMessage(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messaging.createMessage(ctx, dto);
  }
}
