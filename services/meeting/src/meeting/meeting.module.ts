import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { MeetingService } from './meeting.service.js';
import { MeetingController } from './meeting.controller.js';

@Module({
  imports: [OutboxModule],
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}
