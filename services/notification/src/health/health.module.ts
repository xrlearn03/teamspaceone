import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NatsModule } from '../events/nats.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [PrismaModule, NatsModule],
  controllers: [HealthController],
})
export class HealthModule {}
