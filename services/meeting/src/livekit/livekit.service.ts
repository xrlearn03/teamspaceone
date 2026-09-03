import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, type VideoGrant } from 'livekit-server-sdk';

export interface MeetingTokenOptions {
  roomName: string;
  identity: string;
  userId: string;
  name?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canScreenShare?: boolean;
  isAdmin?: boolean;
}

export interface CreateRoomOptions {
  name: string;
  emptyTimeout?: number;
  departureTimeout?: number;
  maxParticipants?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly roomClient: RoomServiceClient;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('LIVEKIT_URL', 'ws://localhost:7880').replace(/^wss?:\/\//, 'http://');
    this.apiKey = this.config.get<string>('LIVEKIT_API_KEY', 'devkey');
    this.apiSecret = this.config.get<string>('LIVEKIT_API_SECRET', 'secret');
    this.roomClient = new RoomServiceClient(host, this.apiKey, this.apiSecret);
  }

  async generateToken(options: MeetingTokenOptions): Promise<string> {
    const grant: VideoGrant = {
      room: options.roomName,
      roomJoin: true,
      roomAdmin: options.isAdmin ?? false,
      canPublish: options.canPublish ?? true,
      canSubscribe: options.canSubscribe ?? true,
      canPublishData: true,
    };

    if (options.canScreenShare) {
      grant.canPublish = true;
    }

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: options.identity,
      name: options.name ?? options.identity,
      ttl: 60 * 60 * 4,
      metadata: JSON.stringify({ userId: options.userId, roomName: options.roomName }),
    });

    token.addGrant(grant);
    return token.toJwt();
  }

  async createRoom(options: CreateRoomOptions) {
    this.logger.log({ roomName: options.name }, 'Creating LiveKit room');
    return this.roomClient.createRoom({
      name: options.name,
      emptyTimeout: options.emptyTimeout ?? 60,
      departureTimeout: options.departureTimeout ?? 10,
      maxParticipants: options.maxParticipants ?? 100,
      metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
    });
  }

  async deleteRoom(name: string): Promise<void> {
    this.logger.log({ roomName: name }, 'Deleting LiveKit room');
    return this.roomClient.deleteRoom(name);
  }

  async listParticipants(roomName: string) {
    return this.roomClient.listParticipants(roomName);
  }

  async removeParticipant(roomName: string, identity: string): Promise<void> {
    return this.roomClient.removeParticipant(roomName, identity);
  }

  async updateParticipantScreenShare(roomName: string, identity: string, isScreenSharing: boolean): Promise<void> {
    await this.roomClient.updateParticipant(roomName, identity, {
      attributes: { isScreenSharing: String(isScreenSharing) },
    });
  }
}
