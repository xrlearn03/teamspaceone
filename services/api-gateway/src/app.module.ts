import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module.js';
import { NatsClientModule } from './nats/nats-client.module.js';
import { MetricsModule } from '@teamspace-one/metrics';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NatsClientModule,
    MetricsModule,
    HealthModule,
  ],
})
export class AppModule {}
