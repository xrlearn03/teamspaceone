import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { type Server, type Socket } from 'socket.io';
import { type EventEnvelope } from '@reactify/event-contracts';
import { Subjects } from '@reactify/event-contracts';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server!: Server;

  afterInit() {
    this.logger.log('Realtime WebSocket gateway initialized');
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, channelId: string): void {
    client.join(`channel:${channelId}`);
    this.logger.log(`Client joined channel: ${channelId}`);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, channelId: string): void {
    client.leave(`channel:${channelId}`);
  }

  broadcast(envelope: EventEnvelope): void {
    if (!this.server) return;

    const payload = envelope.payload as Record<string, any> | undefined;
    const channelId = payload?.channelId as string | undefined;
    if (!channelId) return;

    const room = `channel:${channelId}`;

    if (envelope.eventType === Subjects.MESSAGE_CREATED) {
      this.server.to(room).emit('message.created', payload);
    } else if (envelope.eventType === Subjects.MESSAGE_UPDATED) {
      this.server.to(room).emit('message.updated', payload);
    } else if (envelope.eventType === Subjects.MESSAGE_DELETED) {
      this.server.to(room).emit('message.deleted', payload);
    }
  }
}
