import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { NatsClientModule } from './nats/nats-client.module.js';
import { MetricsModule } from '@reactify/metrics';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NatsClientModule,
    MetricsModule,
    HealthModule,
    GatewayModule,
  ],
})
export class AppModule {}
