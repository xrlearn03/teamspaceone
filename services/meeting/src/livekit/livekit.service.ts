import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, EgressClient, type VideoGrant } from 'livekit-server-sdk';

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
  private readonly egressClient: EgressClient | undefined;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('LIVEKIT_URL', 'ws://localhost:7880').replace(/^wss?:\/\//, 'http://');
    this.apiKey = this.config.get<string>('LIVEKIT_API_KEY', 'devkey');
    this.apiSecret = this.config.get<string>('LIVEKIT_API_SECRET', 'secret');
    this.roomClient = new RoomServiceClient(host, this.apiKey, this.apiSecret);

    const egressHost = this.config.get<string>('LIVEKIT_EGRESS_URL')?.replace(/^wss?:\/\//, 'http://');
    if (egressHost) {
      this.egressClient = new EgressClient(egressHost, this.apiKey, this.apiSecret);
    }
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

  private s3Output(): { bucket: string; accessKey?: string; secret?: string; endpoint?: string; region?: string } | undefined {
    const bucket = this.config.get<string>('LIVEKIT_EGRESS_S3_BUCKET');
    if (!bucket) return undefined;
    return {
      bucket,
      accessKey: this.config.get<string>('LIVEKIT_EGRESS_S3_ACCESS_KEY') ?? undefined,
      secret: this.config.get<string>('LIVEKIT_EGRESS_S3_SECRET_KEY') ?? undefined,
      endpoint: this.config.get<string>('LIVEKIT_EGRESS_S3_ENDPOINT') ?? undefined,
      region: this.config.get<string>('LIVEKIT_EGRESS_S3_REGION') ?? undefined,
    };
  }

  async startRecording(roomName: string): Promise<string | undefined> {
    if (!this.egressClient) {
      this.logger.warn({ roomName }, 'LiveKit Egress client not configured; skipping actual recording');
      return undefined;
    }
    const s3 = this.s3Output();
    if (!s3) {
      this.logger.warn({ roomName }, 'LiveKit Egress S3 output not configured; skipping actual recording');
      return undefined;
    }

    const output = { s3: s3 as unknown };
    const info = await this.egressClient.startRoomCompositeEgress(roomName, output as any);
    this.logger.log({ roomName, egressId: info.egressId }, 'Started LiveKit Egress recording');
    return info.egressId ?? undefined;
  }

  async stopRecording(egressId: string): Promise<void> {
    if (!this.egressClient) return;
    await this.egressClient.stopEgress(egressId);
    this.logger.log({ egressId }, 'Stopped LiveKit Egress recording');
  }
}
