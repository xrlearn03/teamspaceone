import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MeetingService } from './meeting.service.js';

@Injectable()
export class MeetingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly meetings: MeetingService) {}

  onModuleInit() {
    const intervalMs = Number(process.env.MEETING_SWEEP_INTERVAL_MS ?? 30_000);
    this.timer = setInterval(() => {
      this.meetings.sweepScheduledMeetings().catch((err: Error) => {
        this.logger.error(`Scheduled-meeting sweep failed: ${err.message}`);
      });
    }, intervalMs);
    this.timer.unref?.();
    void this.meetings.sweepScheduledMeetings().catch((err: Error) => {
      this.logger.error(`Scheduled-meeting sweep failed: ${err.message}`);
    });
    this.logger.log(`Started scheduled-meeting sweeper (interval ${intervalMs}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
