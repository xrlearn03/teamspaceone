import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MeetingService } from './meeting.service.js';
import { type GuestJoinDto } from './dto/guest-join.dto.js';

/**
 * Unauthenticated guest access via signed meeting links. The API gateway
 * proxies /meetings/public without a JWT; the HMAC token in the path is the
 * capability. Guests only receive an SFU media token — no org data.
 */
@Controller('meetings/public')
export class PublicMeetingController {
  constructor(private readonly meeting: MeetingService) {}

  @Get('join/:token')
  getGuestMeetingInfo(@Param('token') token: string) {
    return this.meeting.getGuestMeetingInfo(token);
  }

  @Post('join/:token')
  joinAsGuest(@Param('token') token: string, @Body() dto: GuestJoinDto) {
    return this.meeting.joinAsGuest(token, dto);
  }
}
