import { CanActivate, ExecutionContext, Injectable, Type } from '@nestjs/common';
import { can, type AuthorizationError } from './policy-engine.js';
import type { AuthorizableUser, ScopeContext } from './types.js';

export type ScopeContextFactory = (context: ExecutionContext, user: AuthorizableUser) => ScopeContext | undefined;

export interface PermissionGuardOptions {
  permissions: string | string[];
  scopeContext?: ScopeContextFactory;
  any?: boolean;
}

export function PermissionGuard(
  permission: string,
  scopeContext?: ScopeContextFactory,
): Type<CanActivate>;
export function PermissionGuard(options: PermissionGuardOptions): Type<CanActivate>;
export function PermissionGuard(
  permissionOrOptions: string | string[] | PermissionGuardOptions,
  scopeContext?: ScopeContextFactory,
): Type<CanActivate> {
  const options: PermissionGuardOptions = typeof permissionOrOptions === 'string'
    ? { permissions: permissionOrOptions, scopeContext }
    : Array.isArray(permissionOrOptions)
    ? { permissions: permissionOrOptions, scopeContext }
    : permissionOrOptions;

  const permissions = Array.isArray(options.permissions) ? options.permissions : [options.permissions];

  @Injectable()
  class PermissionGuardImpl implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const user = request.user as AuthorizableUser | undefined;

      if (!user || !user.permissions) {
        return false;
      }

      const scope = options.scopeContext ? options.scopeContext(context, user) : undefined;

      if (options.any) {
        return permissions.some((p) => can(user, p, scope));
      }

      return permissions.every((p) => can(user, p, scope));
    }
  }

  return PermissionGuardImpl;
}

export { AuthorizationError } from './policy-engine.js';
