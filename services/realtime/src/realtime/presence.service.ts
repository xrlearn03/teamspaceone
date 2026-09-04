import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface PresenceMessage {
  room: string;
  event: string;
  payload: unknown;
}

type MessageListener = (room: string, event: string, payload: unknown) => void;

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private subscriber!: Redis;
  private publisher!: Redis;
  private listener?: MessageListener;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.subscriber = new Redis(url);
    this.publisher = new Redis(url);

    const channels = ['realtime:typing', 'realtime:presence', 'realtime:connection'];
    this.subscriber.subscribe(...channels, (err) => {
      if (err) {
        this.logger.error(`Redis subscribe error: ${err.message}`);
      } else {
        this.logger.log(`Subscribed to Redis channels: ${channels.join(', ')}`);
      }
    });

    this.subscriber.on('message', (channel, message) => {
      try {
        const { room, event, payload } = JSON.parse(message) as PresenceMessage;
        this.listener?.(room, event, payload);
      } catch (err) {
        this.logger.warn(`Invalid Redis message on ${channel}: ${(err as Error).message}`);
      }
    });
  }

  onModuleDestroy(): void {
    this.subscriber.disconnect();
    this.publisher.disconnect();
  }

  publish(channel: string, room: string, event: string, payload: unknown): void {
    this.publisher.publish(channel, JSON.stringify({ room, event, payload }));
  }

  onMessage(listener: MessageListener): void {
    this.listener = listener;
  }
}
