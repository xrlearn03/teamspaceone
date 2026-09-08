import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NatsClientService } from '../events/nats-client.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsClientService,
  ) {}

  @Get()
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'search-service' };
  }

  @Get('ready')
  async ready(): Promise<{ status: string; db: boolean; nats: boolean }> {
    let db = false;
    try {
      await this.prisma.healthCheck();
      db = true;
    } catch {
      db = false;
    }
    const nats = this.nats.isConnected();
    const result = { status: db && nats ? 'ok' : 'degraded', db, nats };
    if (!db || !nats) throw new ServiceUnavailableException(result);
    return result;
  }

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }
}
