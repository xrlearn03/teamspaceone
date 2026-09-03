import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LiveKitModule } from '../livekit/livekit.module.js';
import { MeetingService } from './meeting.service.js';
import { MeetingController } from './meeting.controller.js';

@Module({
  imports: [OutboxModule, LiveKitModule, PrismaModule],
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}
