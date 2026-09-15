import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can } from './policy-engine.js';
import type { AuthorizableUser } from './types.js';

export const PERMISSION_METADATA_KEY = 'teamspace-one:permissions';
export const AUTHORIZATION_OPTIONS = 'TEAMSPACE_ONE_AUTHORIZATION_OPTIONS';

export interface PermissionRequirement {
  permissions: string[];
  requireAll: boolean;
}

/**
 * Marks a route (or controller) as requiring the given permission string(s).
 * With `requireAll` (default) every permission must match; otherwise any one
 * is sufficient. Only enforced where {@link RemotePermissionGuard} is applied.
 */
export const RequirePermissions = (permissions: string | string[], requireAll = true) =>
  SetMetadata(PERMISSION_METADATA_KEY, {
    permissions: Array.isArray(permissions) ? permissions : [permissions],
    requireAll,
  } satisfies PermissionRequirement);

export interface RemoteAuthorizationOptions {
  /** Base URL of the organisation service, e.g. http://organisation-service:3003 */
  organisationServiceUrl?: string;
  /** Shared service-to-service secret sent as x-internal-api-key. */
  internalApiKey?: string;
  /** Caller identity sent as x-internal-caller. */
  serviceName: string;
  /** How long a fetched user context is cached. Default: 30s. */
  cacheTtlMs?: number;
}

interface CacheEntry {
  user: AuthorizableUser | null;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 5_000;

/**
 * Permission guard for services that do not own the RBAC schema. It resolves
 * the caller's `AuthorizableUser` via the organisation service's
 * `GET /organisations/:id/me/context` endpoint over authenticated
 * service-to-service HTTP, caches it briefly, then evaluates `can()` locally.
 *
 * Routes without `@RequirePermissions` metadata pass through untouched, so
 * internal endpoints (e.g. `/channels/:id/access`) keep working for service
 * callers that do not carry an actor.
 */
@Injectable()
export class RemotePermissionGuard implements CanActivate {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly options: RemoteAuthorizationOptions;

  constructor(
    @Optional() @Inject(AUTHORIZATION_OPTIONS) options: RemoteAuthorizationOptions | null,
    private readonly reflector: Reflector,
  ) {
    this.options = options ?? { serviceName: 'unknown' };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(PERMISSION_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const headers = request.headers ?? {};
    const organisationId = headers['x-organisation-id'] as string | undefined;
    const actorId = headers['x-actor-id'] as string | undefined;
    if (!organisationId || !actorId) {
      throw new ForbiddenException('Missing organisation or actor context');
    }

    const user = await this.getUserContext(organisationId, actorId);
    if (!user) {
      throw new ForbiddenException('Not a member of this organisation');
    }

    request.user = user;

    const allowed = requirement.requireAll
      ? requirement.permissions.every((p) => can(user, p))
      : requirement.permissions.some((p) => can(user, p));
    if (!allowed) {
      throw new ForbiddenException(`Missing required permission(s): ${requirement.permissions.join(', ')}`);
    }

    return true;
  }

  private async getUserContext(organisationId: string, actorId: string): Promise<AuthorizableUser | null> {
    const key = `${organisationId}:${actorId}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.user;

    const { organisationServiceUrl, internalApiKey, serviceName } = this.options;
    if (!organisationServiceUrl || !internalApiKey) {
      throw new ServiceUnavailableException('Authorization is not configured for this service');
    }

    let res: Response;
    try {
      res = await fetch(`${organisationServiceUrl}/organisations/${organisationId}/me/context`, {
        headers: {
          'x-internal-api-key': internalApiKey,
          'x-internal-caller': serviceName,
          'x-organisation-id': organisationId,
          'x-actor-id': actorId,
        },
      });
    } catch {
      throw new ServiceUnavailableException('Authorization service unavailable');
    }

    const user = res.ok ? ((await res.json()) as AuthorizableUser) : null;
    this.cache.set(key, { user, expiresAt: now + (this.options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS) });
    return user;
  }
}
