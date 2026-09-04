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
    const room = `channel:${channelId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined channel room ${room}`);
  }

  @SubscribeMessage('join-user')
  handleJoinUser(client: Socket, userId: string): void {
    const room = `user:${userId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined user room ${room}`);
  }

  @SubscribeMessage('join-project')
  handleJoinProject(client: Socket, projectId: string): void {
    const room = `project:${projectId}`;
    client.join(room);
  }

  @SubscribeMessage('join-meeting')
  handleJoinMeeting(client: Socket, meetingId: string): void {
    const room = `meeting:${meetingId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined meeting room ${room}`);
  }

  @SubscribeMessage('join-organisation')
  handleJoinOrganisation(client: Socket, organisationId: string): void {
    const room = `organisation:${organisationId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined organisation room ${room}`);
  }

  @SubscribeMessage('join-workspace')
  handleJoinWorkspace(client: Socket, workspaceId: string): void {
    const room = `workspace:${workspaceId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined workspace room ${room}`);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, room: string): void {
    client.leave(room);
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
        const eventName = envelope.eventType.replace('reactify.', '');
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
      case Subjects.PROJECT_ATTACHMENT_REMOVED: {
        const projectId = payload.projectId as string | undefined;
        if (projectId) {
          this.server.to(`project:${projectId}`).emit(envelope.eventType.replace('reactify.', ''), payload);
        }
        break;
      }
      case Subjects.CHANNEL_CREATED:
      case Subjects.CHANNEL_UPDATED:
      case Subjects.CHANNEL_DELETED:
      case Subjects.CHANNEL_MEMBERS_UPDATED: {
        const organisationId = envelope.organisationId;
        const eventName = envelope.eventType.replace('reactify.', '');
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
