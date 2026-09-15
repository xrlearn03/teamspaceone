import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ADMIN_PERMISSIONS, permissionMatches } from '@teamspace-one/authorization';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../organisation/authorization.service.js';

const PLATFORM_ORG_CACHE_TTL_MS = 60_000;

/**
 * Platform administration is only available to members of the dedicated
 * platform organisation (PLATFORM_ORGANISATION_SLUG) holding the
 * `admin.system.settings` permission — granted exclusively by the seeded
 * `platform_super_admin` role. Checking the permission alone is not enough:
 * organisation owners carry a `*` grant which wildcard-matches every
 * permission, so the organisation context must be verified as well.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  private platformOrgId: string | null = null;
  private platformOrgResolvedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const actorId = req.headers['x-actor-id'];
    const organisationId = req.headers['x-organisation-id'];

    const platformOrgId = await this.resolvePlatformOrganisationId();
    if (!actorId || !organisationId || !platformOrgId || organisationId !== platformOrgId) {
      throw new ForbiddenException('Platform administration requires the platform organisation context');
    }

    const user = await this.authorization.getUserContext(this.prisma, platformOrgId, actorId);
    const allowed = user?.permissions.some((granted) =>
      permissionMatches(granted, ADMIN_PERMISSIONS.SYSTEM_SETTINGS),
    );
    if (!allowed) {
      throw new ForbiddenException('Platform administration permission required');
    }
    return true;
  }

  private async resolvePlatformOrganisationId(): Promise<string | null> {
    if (Date.now() - this.platformOrgResolvedAt < PLATFORM_ORG_CACHE_TTL_MS) {
      return this.platformOrgId;
    }
    this.platformOrgResolvedAt = Date.now();
    const slug = this.config.get<string>('PLATFORM_ORGANISATION_SLUG');
    if (!slug) {
      this.platformOrgId = null;
      return null;
    }
    const org = await this.prisma.organisation.findUnique({
      where: { slug },
      select: { id: true },
    });
    this.platformOrgId = org?.id ?? null;
    return this.platformOrgId;
  }
}
