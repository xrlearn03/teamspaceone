import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller.js';
import { GatewayService } from './gateway.service.js';

@Module({
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}
