import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify } from 'jsonwebtoken';
import { type Server, type Socket } from 'socket.io';
import { type EventEnvelope } from '@teamspace-one/event-contracts';
import { Subjects } from '@teamspace-one/event-contracts';
import { AccessService } from './access.service.js';
import { PresenceService } from './presence.service.js';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:1420',
  'http://localhost:5173',
  'http://tauri.localhost',
  'tauri://localhost',
];

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean) || DEFAULT_CORS_ORIGINS,
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  private jwtSecret!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly access: AccessService,
    private readonly presence: PresenceService,
  ) {}

  @WebSocketServer() server!: Server;

  afterInit() {
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    this.jwtSecret = jwtSecret;

    this.presence.onMessage((room, event, payload) => {
      if (!this.server) return;
      this.server.to(room).emit(event, payload);
    });
    this.logger.log('Realtime WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    const token = typeof client.handshake.auth?.token === 'string'
      ? client.handshake.auth.token
      : client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    try {
      if (!token) throw new Error('Missing token');
      const payload = verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as { sub?: string; type?: string };
      if (!payload.sub || payload.type !== 'access') throw new Error('Invalid access token');
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch (err) {
      this.logger.warn({ clientId: client.id, error: (err as Error).message }, 'Realtime connection rejected');
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(client: Socket, channelId: string): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !(await this.access.canAccess(userId, 'channel', channelId))) return;
    const room = `channel:${channelId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined channel room ${room}`);
  }

  @SubscribeMessage('join-user')
  handleJoinUser(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const room = `user:${userId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined user room ${room}`);
  }

  @SubscribeMessage('join-project')
  async handleJoinProject(client: Socket, projectId: string): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !(await this.access.canAccess(userId, 'project', projectId))) return;
    await client.join(`project:${projectId}`);
  }

  @SubscribeMessage('join-meeting')
  async handleJoinMeeting(client: Socket, meetingId: string): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !(await this.access.canAccess(userId, 'meeting', meetingId))) return;
    const room = `meeting:${meetingId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined meeting room ${room}`);
  }

  @SubscribeMessage('join-organisation')
  async handleJoinOrganisation(client: Socket, organisationId: string): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !(await this.access.canAccess(userId, 'organisation', organisationId))) return;
    const room = `organisation:${organisationId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined organisation room ${room}`);
  }

  @SubscribeMessage('join-workspace')
  async handleJoinWorkspace(client: Socket, workspaceId: string): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !(await this.access.canAccess(userId, 'workspace', workspaceId))) return;
    const room = `workspace:${workspaceId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined workspace room ${room}`);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, room: string): void {
    client.leave(room);
  }

  @SubscribeMessage('typing')
  handleTyping(client: Socket, data: { room: string; isTyping: boolean }): void {
    const userId = client.data.userId as string | undefined;
    if (!userId || !client.rooms.has(data.room)) return;
    this.presence.publish('realtime:typing', data.room, 'typing', { userId, isTyping: data.isTyping, room: data.room });
  }

  @SubscribeMessage('presence')
  handlePresence(client: Socket, data: { room: string; status: string }): void {
    const userId = client.data.userId as string | undefined;
    if (!userId || !client.rooms.has(data.room)) return;
    this.presence.publish('realtime:presence', data.room, 'presence', { userId, status: data.status, room: data.room });
  }

  @SubscribeMessage('connection-state')
  handleConnectionState(client: Socket, data: { room: string; state: string }): void {
    const userId = client.data.userId as string | undefined;
    if (!userId || !client.rooms.has(data.room)) return;
    this.presence.publish('realtime:connection', data.room, 'connection-state', { userId, state: data.state, room: data.room });
  }

  @SubscribeMessage('call.ring')
  async handleCallRing(
    client: Socket,
    data: {
      meetingId: string;
      kind: 'audio' | 'video';
      title?: string;
      channelId?: string;
      callerName?: string;
      userIds?: string[];
    },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data.meetingId || !Array.isArray(data.userIds)) return;
    if (!(await this.access.canAccess(userId, 'meeting', data.meetingId))) return;
    if (data.channelId && !(await this.access.canAccess(userId, 'channel', data.channelId))) return;
    const payload = {
      meetingId: data.meetingId,
      kind: data.kind === 'audio' ? 'audio' : 'video',
      title: data.title,
      channelId: data.channelId,
      callerId: userId,
      callerName: data.callerName,
      at: new Date().toISOString(),
    };
    for (const target of data.userIds) {
      if (typeof target !== 'string' || target === userId) continue;
      this.server.to(`user:${target}`).emit('call.incoming', payload);
    }
  }

  @SubscribeMessage('call.cancel')
  async handleCallCancel(client: Socket, data: { meetingId: string; userIds?: string[] }): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data.meetingId || !Array.isArray(data.userIds)) return;
    if (!(await this.access.canAccess(userId, 'meeting', data.meetingId))) return;
    const payload = { meetingId: data.meetingId, callerId: userId };
    for (const target of data.userIds) {
      if (typeof target !== 'string' || target === userId) continue;
      this.server.to(`user:${target}`).emit('call.ended', payload);
    }
  }

  @SubscribeMessage('call.response')
  handleCallResponse(
    client: Socket,
    data: { meetingId: string; callerId: string; response: 'accepted' | 'declined'; userName?: string },
  ): void {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data.meetingId || !data.callerId) return;
    this.server.to(`user:${data.callerId}`).emit('call.response', {
      meetingId: data.meetingId,
      userId,
      userName: data.userName,
      response: data.response === 'accepted' ? 'accepted' : 'declined',
    });
  }

  @SubscribeMessage('message.read')
  handleMessageRead(client: Socket, data: { room: string; messageId: string }): void {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data.room || !data.messageId || !client.rooms.has(data.room)) return;
    this.presence.publish('realtime:presence', data.room, 'read-receipt', {
      userId,
      messageId: data.messageId,
      room: data.room,
      readAt: new Date().toISOString(),
    });
  }

  broadcast(envelope: EventEnvelope): void {
    if (!this.server) return;

    const payload = envelope.payload as Record<string, any> | undefined;
    if (!payload) return;

    switch (envelope.eventType) {
      case Subjects.PROJECT_CREATED:
        this.server.to(`organisation:${envelope.organisationId}`).emit('project.created', payload);
        break;
      case Subjects.PROJECT_UPDATED:
      case Subjects.PROJECT_DELETED: {
        const projectId = (payload.id ?? envelope.resourceId) as string;
        const eventName = envelope.eventType.replace('teamspace-one.', '');
        this.server.to(`organisation:${envelope.organisationId}`).to(`project:${projectId}`).emit(eventName, payload);
        break;
      }
      case Subjects.TASK_CREATED:
      case Subjects.TASK_UPDATED:
      case Subjects.TASK_COMPLETED:
      case Subjects.PROJECT_COMMENT_CREATED:
      case Subjects.PROJECT_COMMENT_UPDATED:
      case Subjects.PROJECT_COMMENT_DELETED:
      case Subjects.PROJECT_ATTACHMENT_ADDED:
      case Subjects.PROJECT_ATTACHMENT_REMOVED:
      case Subjects.APPROVAL_CREATED:
      case Subjects.APPROVAL_APPROVED:
      case Subjects.APPROVAL_REJECTED: {
        const projectId = payload.projectId as string | undefined;
        if (projectId) {
          this.server.to(`project:${projectId}`).emit(envelope.eventType.replace('teamspace-one.', ''), payload);
        }
        break;
      }
      case Subjects.CHANNEL_CREATED:
      case Subjects.CHANNEL_UPDATED:
      case Subjects.CHANNEL_DELETED:
      case Subjects.CHANNEL_MEMBERS_UPDATED: {
        const organisationId = envelope.organisationId;
        const eventName = envelope.eventType.replace('teamspace-one.', '');
        this.server.to(`organisation:${organisationId}`).emit(eventName, payload);
        break;
      }
      case Subjects.MESSAGE_CREATED: {
        const channelId = payload.channelId as string | undefined;
        if (channelId) {
          this.server.to(`channel:${channelId}`).emit('message.created', payload);
        }
        break;
      }
      case Subjects.MESSAGE_UPDATED: {
        const channelId = payload.channelId as string | undefined;
        if (channelId) {
          this.server.to(`channel:${channelId}`).emit('message.updated', payload);
        }
        break;
      }
      case Subjects.MESSAGE_DELETED: {
        const channelId = payload.channelId as string | undefined;
        if (channelId) {
          this.server.to(`channel:${channelId}`).emit('message.deleted', payload);
        }
        break;
      }
      case Subjects.MESSAGE_REACTION_UPDATED: {
        const channelId = payload.channelId as string | undefined;
        if (channelId) {
          this.server.to(`channel:${channelId}`).emit('message.reaction.updated', payload);
        }
        break;
      }
      case Subjects.NOTIFICATION_CREATED: {
        const userId = payload.userId as string | undefined;
        if (userId) {
          this.server.to(`user:${userId}`).emit('notification.created', payload);
          this.logger.debug({ userId, eventId: envelope.eventId }, 'Broadcasted notification to user room');
        }
        break;
      }
      case Subjects.MEETING_CREATED: {
        const organisationId = envelope.organisationId as string | undefined;
        if (organisationId) {
          this.server.to(`organisation:${organisationId}`).emit('meeting.created', payload);
        }
        break;
      }
      case Subjects.MEETING_STARTED: {
        const meetingId = payload.id as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.started', payload);
        }
        break;
      }
      case Subjects.MEETING_ENDED: {
        const meetingId = payload.id as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.ended', payload);
        }
        break;
      }
      case Subjects.MEETING_PARTICIPANT_JOINED: {
        const meetingId = payload.meetingId as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.participant.joined', payload);
        }
        break;
      }
      case Subjects.MEETING_PARTICIPANT_LEFT: {
        const meetingId = payload.meetingId as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.participant.left', payload);
        }
        break;
      }
      case Subjects.MEETING_SCREEN_SHARED: {
        const meetingId = payload.meetingId as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.screen.shared', payload);
        }
        break;
      }
      case Subjects.MEETING_CHAT_CREATED: {
        const meetingId = payload.meetingId as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.chat.created', payload);
        }
        break;
      }
      case Subjects.MEETING_REACTION_CREATED: {
        const meetingId = payload.meetingId as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.reaction.created', payload);
        }
        break;
      }
      case Subjects.MEETING_RAISE_HAND_CHANGED: {
        const meetingId = payload.meetingId as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.raise_hand.changed', payload);
        }
        break;
      }
      case Subjects.MEETING_RECORDING_STARTED:
      case Subjects.MEETING_RECORDING_STOPPED: {
        const meetingId = payload.meetingId as string | undefined;
        if (meetingId) {
          this.server.to(`meeting:${meetingId}`).emit('meeting.recording.changed', { isRecording: payload.isRecording, recordedBy: payload.recordedBy });
        }
        break;
      }
      case Subjects.VOICE_ROOM_CREATED: {
        const workspaceId = envelope.workspaceId as string | undefined;
        if (workspaceId) {
          this.server.to(`workspace:${workspaceId}`).emit('voice.room.created', payload);
        }
        break;
      }
      default:
        this.logger.debug({ eventType: envelope.eventType }, 'No realtime broadcast configured');
    }
  }
}
