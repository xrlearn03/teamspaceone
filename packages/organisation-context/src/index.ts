import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  Module,
  NestMiddleware,
} from '@nestjs/common';

export interface OrganisationContextValue {
  organisationId: string;
  workspaceId?: string;
  actorId?: string;
  correlationId: string;
  causationId?: string;
}

const storage = new AsyncLocalStorage<OrganisationContextValue>();

export class OrganisationContext {
  static run<T>(ctx: OrganisationContextValue, fn: () => T | Promise<T>): Promise<T> {
    return storage.run(ctx, fn) as Promise<T>;
  }

  static get(): OrganisationContextValue | undefined {
    return storage.getStore();
  }

  static require(): OrganisationContextValue {
    const ctx = this.get();
    if (!ctx) {
      throw new Error('Organisation context is not set');
    }
    return ctx;
  }

  static getOrganisationId(): string {
    return this.require().organisationId;
  }

  static getCorrelationId(): string {
    return this.require().correlationId;
  }
}

export interface OrganisationContextMiddlewareOptions {
  /**
   * Require the `x-internal-api-key` header (shared service secret) on all
   * non-exempt requests. Proves the request arrived via the API gateway or
   * another trusted service. Default: true.
   */
  requireInternalApiKey?: boolean;
  /** Paths that skip the internal-key check. Default: /health and /socket.io. */
  exemptPaths?: (string | RegExp)[];
}

const DEFAULT_EXEMPT_PATHS: (string | RegExp)[] = ['/health', /^\/socket\.io/];

function safeSecretEqual(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

@Injectable()
export class OrganisationContextMiddleware implements NestMiddleware {
  constructor(private readonly options: OrganisationContextMiddlewareOptions = {}) {}

  use(req: any, res: any, next: () => void): void {
    const headers = req.headers ?? {};
    const path: string = (req.path ?? req.url ?? '').split('?')[0];
    const exemptPaths = this.options.exemptPaths ?? DEFAULT_EXEMPT_PATHS;
    const isExempt = exemptPaths.some((p) => (typeof p === 'string' ? p === path : p.test(path)));

    if (this.options.requireInternalApiKey !== false && !isExempt) {
      const expected = process.env.INTERNAL_API_KEY;
      if (!expected) {
        res.status(500).json({ error: 'Service authentication is not configured' });
        return;
      }
      const provided = headers['x-internal-api-key'];
      if (typeof provided !== 'string' || !safeSecretEqual(provided, expected)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    const organisationId = headers['x-organisation-id'];
    const workspaceId = headers['x-workspace-id'];
    const actorId = headers['x-actor-id'];
    const causationId = headers['x-causation-id'];
    const correlationId = headers['x-correlation-id'] ?? randomUUID();

    const ctx: OrganisationContextValue = {
      organisationId: organisationId ?? 'unknown',
      workspaceId,
      actorId,
      correlationId,
      causationId,
    };

    OrganisationContext.run(ctx, next);
  }
}

export const CurrentOrganisation = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrganisationContextValue => {
    const request = ctx.switchToHttp().getRequest();
    const headers = request.headers ?? {};
    const organisationId = headers['x-organisation-id'];

    if (!organisationId) {
      throw new BadRequestException('Missing x-organisation-id header');
    }

    return {
      organisationId,
      workspaceId: headers['x-workspace-id'],
      actorId: headers['x-actor-id'],
      correlationId: headers['x-correlation-id'] ?? randomUUID(),
      causationId: headers['x-causation-id'],
    };
  },
);

@Module({
  providers: [OrganisationContextMiddleware],
  exports: [OrganisationContextMiddleware],
})
export class OrganisationContextModule {}
