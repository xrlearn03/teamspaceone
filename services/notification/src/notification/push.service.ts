import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';
import * as apn from 'apn';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PushNotification {
  userId: string;
  title: string;
  body: string;
  link?: string | null;
  notificationId?: string;
}

export interface RegisterDeviceDto {
  platform: 'android' | 'ios';
  token: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private fcmApp: admin.App | null = null;
  private apnProvider: apn.Provider | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async registerToken(
    organisationId: string,
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<{ id: string }> {
    const token = await this.prisma.deviceToken.upsert({
      where: {
        userId_platform_token: {
          userId,
          platform: dto.platform,
          token: dto.token,
        },
      },
      update: {},
      create: {
        organisationId,
        userId,
        platform: dto.platform,
        token: dto.token,
      },
    });
    return { id: token.id };
  }

  async unregisterToken(
    userId: string,
    platform?: string,
    token?: string,
  ): Promise<{ deleted: number }> {
    const where: { userId: string; platform?: string; token?: string } = { userId };
    if (platform) where.platform = platform;
    if (token) where.token = token;

    const result = await this.prisma.deviceToken.deleteMany({ where });
    return { deleted: result.count };
  }

  async sendPush(notification: PushNotification): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: notification.userId },
    });
    if (tokens.length === 0) {
      this.logger.debug({ userId: notification.userId }, 'No device tokens for push');
      return;
    }

    const androidTokens = tokens.filter((t) => t.platform === 'android').map((t) => t.token);
    const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);

    if (androidTokens.length > 0) {
      await this.sendFcm(androidTokens, notification);
    }
    if (iosTokens.length > 0) {
      await this.sendApn(iosTokens, notification);
    }
  }

  private async sendFcm(tokens: string[], notification: PushNotification): Promise<void> {
    const app = this.getFcmApp();
    if (!app) {
      this.logger.warn('FCM not configured; skipping Android push delivery');
      return;
    }

    try {
      const response = await getMessaging(app).sendEachForMulticast({
        tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.link ? { link: notification.link, notificationId: notification.notificationId ?? '' } : { notificationId: notification.notificationId ?? '' },
      });

      this.logger.debug(
        { successCount: response.successCount, failureCount: response.failureCount },
        'FCM multicast complete',
      );

      const invalidTokens = tokens.filter((_, index) => {
        const result = response.responses[index];
        return result?.error?.code?.includes('registration-token-not-registered');
      });
      if (invalidTokens.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, 'Failed to send FCM push');
      throw err;
    }
  }

  private async sendApn(tokens: string[], notification: PushNotification): Promise<void> {
    const provider = this.getApnProvider();
    if (!provider) {
      this.logger.warn('APNs not configured; skipping iOS push delivery');
      return;
    }

    const note = new apn.Notification();
    note.topic = this.config.get<string>('APN_BUNDLE_ID') ?? this.config.get<string>('APP_BUNDLE_ID') ?? '';
    note.pushType = 'alert';
    note.aps = {
      alert: { title: notification.title, body: notification.body },
      badge: 1,
      sound: 'default',
    };
    note.payload = {
      link: notification.link,
      notificationId: notification.notificationId,
    };

    try {
      const result = await provider.send(note, tokens);
      this.logger.debug(
        { sent: result.sent.length, failed: result.failed.length },
        'APNs multicast complete',
      );

      const invalidTokens = result.failed
        .filter((f) => {
          const response = (f.response as { reason?: string }) ?? {};
          return response.reason === 'Unregistered' || response.reason === 'BadDeviceToken';
        })
        .map((f) => f.device);
      if (invalidTokens.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, 'Failed to send APNs push');
      throw err;
    }
  }

  private getFcmApp(): admin.App | null {
    if (this.fcmApp) return this.fcmApp;

    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const serviceAccountPath = this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS');
    if (!projectId || !serviceAccountPath) {
      return null;
    }

    this.fcmApp = admin.initializeApp({
      credential: admin.cert(serviceAccountPath),
      projectId,
    });
    return this.fcmApp;
  }

  private getApnProvider(): apn.Provider | null {
    if (this.apnProvider) return this.apnProvider;

    const key = this.config.get<string>('APN_KEY');
    const keyId = this.config.get<string>('APN_KEY_ID');
    const teamId = this.config.get<string>('APN_TEAM_ID');
    if (!key || !keyId || !teamId) {
      return null;
    }

    const production = this.config.get<string>('NODE_ENV') === 'production';
    this.apnProvider = new apn.Provider({
      token: { key, keyId, teamId },
      production,
    });
    return this.apnProvider;
  }
}
