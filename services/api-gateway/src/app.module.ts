import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module.js';
import { NatsClientModule } from './nats/nats-client.module.js';
import { WellKnownModule } from './well-known/well-known.module.js';
import { MetricsModule } from '@teamspace-one/metrics';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NatsClientModule,
    MetricsModule,
    HealthModule,
    WellKnownModule,
  ],
})
export class AppModule {}
