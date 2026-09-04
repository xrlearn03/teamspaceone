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

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly config: ConfigService) {}

  @WebSocketServer() server!: Server;

  afterInit() {
    this.logger.log('Realtime WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    const token = typeof client.handshake.auth?.token === 'string'
      ? client.handshake.auth.token
      : client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    try {
      if (!token) throw new Error('Missing token');
      const payload = verify(token, this.config.get<string>('JWT_SECRET', 'change-me')) as { sub?: string; type?: string };
      if (!payload.sub || payload.type !== 'access') throw new Error('Invalid access token');
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(client: Socket, channelId: string): Promise<void> {
    const access = await this.resolveResource(this.config.get('MESSAGING_SERVICE_URL', 'http://localhost:3004'), `channels/${channelId}/access`, client);
    if (!access || !(await this.canAccessOrganisation(access.organisationId, client))) return;
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
    const access = await this.resolveResource(this.config.get('PROJECTS_SERVICE_URL', 'http://localhost:3006'), `projects/${projectId}/access`, client);
    if (!access || !(await this.canAccessOrganisation(access.organisationId, client))) return;
    await client.join(`project:${projectId}`);
  }

  @SubscribeMessage('join-meeting')
  async handleJoinMeeting(client: Socket, meetingId: string): Promise<void> {
    const access = await this.resolveResource(this.config.get('MEETING_SERVICE_URL', 'http://localhost:3009'), `meetings/${meetingId}/access`, client);
    if (!access || !(await this.canAccessOrganisation(access.organisationId, client))) return;
    const room = `meeting:${meetingId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined meeting room ${room}`);
  }

  @SubscribeMessage('join-organisation')
  async handleJoinOrganisation(client: Socket, organisationId: string): Promise<void> {
    if (!(await this.canAccessOrganisation(organisationId, client))) return;
    const room = `organisation:${organisationId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined organisation room ${room}`);
  }

  @SubscribeMessage('join-workspace')
  async handleJoinWorkspace(client: Socket, workspaceId: string): Promise<void> {
    const baseUrl = this.config.get('ORGANISATION_SERVICE_URL', 'http://localhost:3003');
    const access = await this.resolveResource(baseUrl, `organisations/workspaces/${workspaceId}/access`, client);
    if (!access) return;
    const room = `workspace:${workspaceId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined workspace room ${room}`);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, room: string): void {
    client.leave(room);
  }

  private async resolveResource(baseUrl: string, path: string, client: Socket): Promise<{ organisationId: string } | null> {
    const actorId = client.data.userId as string | undefined;
    if (!actorId) return null;
    try {
      const response = await fetch(`${baseUrl}/${path}`, { headers: { 'x-actor-id': actorId } });
      return response.ok ? await response.json() as { organisationId: string } : null;
    } catch (error) {
      this.logger.warn(`Resource authorization failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async canAccessOrganisation(organisationId: string, client: Socket): Promise<boolean> {
    const actorId = client.data.userId as string | undefined;
    if (!actorId) return false;
    const baseUrl = this.config.get('ORGANISATION_SERVICE_URL', 'http://localhost:3003');
    try {
      const response = await fetch(`${baseUrl}/organisations/${organisationId}/access`, { headers: { 'x-actor-id': actorId } });
      if (!response.ok) return false;
      return Boolean((await response.json() as { allowed?: boolean }).allowed);
    } catch (error) {
      this.logger.warn(`Organisation authorization failed: ${(error as Error).message}`);
      return false;
    }
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
