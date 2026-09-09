import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
  Query,
  ForbiddenException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { COLLABORATION_PERMISSIONS } from '@teamspace-one/authorization';
import { NotificationService, type NotificationPreferenceInput } from './notification.service.js';
import { PushService, type RegisterDeviceDto } from './push.service.js';

class UpdatePreferenceDto {
  inApp?: boolean;
  email?: boolean;
  desktop?: boolean;
  push?: boolean;
}

@UseGuards(RemotePermissionGuard)
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notification: NotificationService,
    private readonly push: PushService,
  ) {}

  @Get()
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async list(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    return this.notification.list(ctx, {
      unreadOnly: unread === 'true',
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('count/unread')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async countUnread(@CurrentOrganisation() ctx: OrganisationContextValue) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    return { count: await this.notification.countUnread(ctx) };
  }

  @Patch(':id/read')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async markRead(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    const result = await this.notification.markRead(ctx, id);
    return { updated: result.count };
  }

  @Patch('read-all')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async markAllRead(@CurrentOrganisation() ctx: OrganisationContextValue) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    const result = await this.notification.markAllRead(ctx);
    return { updated: result.count };
  }

  @Get('preferences/:eventType')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async getPreference(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('eventType') eventType: string,
  ) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    return this.notification.getPreferenceForUser(ctx, eventType);
  }

  @Post('preferences/:eventType')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async setPreference(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('eventType') eventType: string,
    @Body() dto: UpdatePreferenceDto,
  ) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    if (!eventType) {
      throw new BadRequestException('eventType is required');
    }

    const input: NotificationPreferenceInput = {
      inApp: dto.inApp,
      email: dto.email,
      desktop: dto.desktop,
      push: dto.push,
    };

    return this.notification.setPreferenceForUser(ctx, eventType, input);
  }

  @Post('devices')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async registerDevice(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: RegisterDeviceDto,
  ) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    if (!dto.platform || !dto.token) {
      throw new BadRequestException('platform and token are required');
    }
    if (dto.platform !== 'android' && dto.platform !== 'ios') {
      throw new BadRequestException('platform must be android or ios');
    }
    return this.push.registerToken(ctx.organisationId, ctx.actorId, dto as RegisterDeviceDto);
  }

  @Delete('devices')
  @RequirePermissions(COLLABORATION_PERMISSIONS.ACCESS)
  async unregisterDevice(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: { platform?: string; token?: string },
  ) {
    if (!ctx.actorId) {
      throw new ForbiddenException('Missing actor');
    }
    return this.push.unregisterToken(ctx.actorId, dto.platform, dto.token);
  }
}
