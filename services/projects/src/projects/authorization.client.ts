import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthorizableUser, DataScope } from '@teamspace-one/authorization';

interface CacheEntry {
  user: AuthorizableUser | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

/**
 * Resolves a user's effective permissions and data scopes by calling the
 * organisation service. The projects service cannot access the organisation
 * database directly, so the context is fetched over service-to-service HTTP.
 */
@Injectable()
export class AuthorizationClientService {
  private readonly logger = new Logger(AuthorizationClientService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  async getUserContext(
    organisationId: string,
    actorId: string,
    correlationId?: string,
  ): Promise<AuthorizableUser | null> {
    const cacheKey = `${organisationId}:${actorId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const baseUrl = this.config.get<string>('ORGANISATION_SERVICE_URL', 'http://localhost:3003');
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!internalApiKey) {
      throw new Error('INTERNAL_API_KEY environment variable is required');
    }

    const url = `${baseUrl}/organisations/${organisationId}/me/context`;
    let user: AuthorizableUser | null = null;

    try {
      const response = await fetch(url, {
        headers: {
          'x-internal-api-key': internalApiKey,
          'x-internal-caller': 'projects-service',
          'x-actor-id': actorId,
          'x-organisation-id': organisationId,
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
      });

      if (response.status === 404 || response.status === 403) {
        user = null;
      } else if (!response.ok) {
        this.logger.warn(
          { status: response.status, organisationId, actorId },
          'Failed to resolve user context from organisation service',
        );
        user = null;
      } else {
        const body = (await response.json()) as {
          id: string;
          organisationId: string;
          permissions: string[];
          dataScopes: DataScope[];
          isSuperAdmin?: boolean;
        };
        user = {
          id: body.id,
          organisationId: body.organisationId,
          permissions: body.permissions ?? [],
          dataScopes: body.dataScopes ?? [],
          isSuperAdmin: body.isSuperAdmin,
        };
      }
    } catch (err) {
      this.logger.error(
        { error: (err as Error).message, organisationId, actorId },
        'Organisation service context lookup failed',
      );
      user = null;
    }

    this.cache.set(cacheKey, { user, expiresAt: Date.now() + CACHE_TTL_MS });
    return user;
  }
}
