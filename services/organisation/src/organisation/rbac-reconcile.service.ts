import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { reconcileRbac } from '../seed/rbac-reconcile.js';

/**
 * Re-runs the RBAC reconcile on service startup so system-managed roles pick
 * up permissions/scopes added to the templates after an organisation was
 * seeded (e.g. `interview.job.create` for the recruiter role). Idempotent and
 * non-blocking — failures are logged and never prevent the service starting.
 */
@Injectable()
export class RbacReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacReconcileService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    void reconcileRbac(this.prisma)
      .then((r) =>
        this.logger.log(
          `RBAC reconcile: ${r.organisations} orgs, ${r.permissions} permissions, ` +
            `${r.rolesCreated} roles created, ${r.rolesBackfilled} roles backfilled, ` +
            `${r.membershipsBackfilled} memberships backfilled`,
        ),
      )
      .catch((err) => this.logger.error('RBAC reconcile failed', err));
  }
}
