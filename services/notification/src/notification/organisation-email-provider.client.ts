import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EmailProvider } from './mailer.js';

interface CacheEntry {
  provider: EmailProvider | null;
  expiresAt: number;
}

@Injectable()
export class OrganisationEmailProviderClient {
  private readonly logger = new Logger(OrganisationEmailProviderClient.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  async getProvider(organisationId: string): Promise<EmailProvider | null> {
    return this.fetchProvider(
      `organisation:${organisationId}`,
      `/internal/organisations/${encodeURIComponent(organisationId)}/email-provider`,
      organisationId,
    );
  }

  async getProviderForUser(userId: string): Promise<EmailProvider | null> {
    return this.fetchProvider(
      `user:${userId}`,
      `/internal/organisations/users/${encodeURIComponent(userId)}/email-provider`,
    );
  }

  private async fetchProvider(cacheKey: string, path: string, organisationId?: string): Promise<EmailProvider | null> {
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.provider;
    }

    const orgUrl = this.config.get<string>('ORGANISATION_SERVICE_URL');
    const internalKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!orgUrl || !internalKey) {
      this.logger.warn('ORGANISATION_SERVICE_URL or INTERNAL_API_KEY is not configured; falling back to default email delivery');
      return null;
    }

    try {
      const response = await fetch(`${orgUrl}${path}`, {
        headers: {
          'x-internal-api-key': internalKey,
          'x-internal-caller': 'notification-service',
          ...(organisationId ? { 'x-organisation-id': organisationId } : {}),
        },
      });

      if (response.status === 404) {
        this.cache.set(cacheKey, { provider: null, expiresAt: Date.now() + this.ttlMs });
        return null;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch email provider: ${response.status} ${body}`);
      }

      const provider = (await response.json()) as EmailProvider | null;
      this.cache.set(cacheKey, { provider, expiresAt: Date.now() + this.ttlMs });
      return provider;
    } catch (err) {
      this.logger.error({ cacheKey, error: (err as Error).message }, 'Failed to load organisation email provider');
      return null;
    }
  }
}
