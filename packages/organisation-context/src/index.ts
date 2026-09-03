import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
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

@Injectable()
export class OrganisationContextMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void): void {
    const headers = req.headers ?? {};
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
      throw new Error('Missing x-organisation-id header');
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
