import { Controller, Get } from '@nestjs/common';
import { NatsClientService } from '../nats/nats-client.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly natsClient: NatsClientService) {}

  @Get()
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'api-gateway' };
  }

  @Get('ready')
  async ready(): Promise<{ status: string; nats: boolean }> {
    const connected = this.natsClient.isConnected();
    return { status: connected ? 'ok' : 'nats-unavailable', nats: connected };
  }

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }
}
