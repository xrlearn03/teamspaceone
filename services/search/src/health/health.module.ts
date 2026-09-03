import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventsModule } from '../events/events.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [HealthController],
})
export class HealthModule {}
