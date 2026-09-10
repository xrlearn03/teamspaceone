import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import { OrganisationContext } from '@teamspace-one/organisation-context';
import { AuthorizationService } from './authorization.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionMetadata {
  permissions: string[];
  requireAll?: boolean;
}

export const RequirePermissions = (permissions: string | string[], requireAll = true) =>
  SetMetadata(PERMISSIONS_KEY, { permissions: Array.isArray(permissions) ? permissions : [permissions], requireAll });

@Injectable()
export class OrganisationPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<PermissionMetadata>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) {
      return true;
    }

    const ctx = OrganisationContext.get();
    if (!ctx?.actorId || !ctx?.organisationId) {
      throw new ForbiddenException('Missing organisation context');
    }

    const user = await this.authorization.getUserContext(this.prisma, ctx.organisationId, ctx.actorId);
    if (!user) {
      throw new ForbiddenException('Not a member of this organisation');
    }

    const permissions = metadata.permissions;
    const check = metadata.requireAll
      ? permissions.every((p) => can(user as AuthorizableUser, p))
      : permissions.some((p) => can(user as AuthorizableUser, p));

    if (!check) {
      throw new ForbiddenException(`Missing required permission(s): ${permissions.join(', ')}`);
    }

    const req = context.switchToHttp().getRequest();
    req.user = user;
    return true;
  }
}
