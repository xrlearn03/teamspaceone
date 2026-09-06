import { permissionMatches } from './permissions.js';
import type { AuthorizableUser, DataScope, ScopeContext, ScopeType } from './types.js';

export { permissionMatches } from './permissions.js';

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly permission?: string,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

function moduleOf(permission: string): string {
  return permission.split('.')[0] ?? '*';
}

function matchesModule(scope: DataScope, permission: string): boolean {
  return scope.module === '*' || scope.module === moduleOf(permission);
}

export function hasPermission(user: Pick<AuthorizableUser, 'permissions'>, permission: string): boolean {
  if (user.permissions.includes('*')) return true;
  return user.permissions.some((granted) => permissionMatches(granted, permission));
}

export function can(
  user: AuthorizableUser,
  permission: string,
  scopeContext?: ScopeContext,
): boolean {
  if (user.isSuperAdmin) return true;

  if (scopeContext?.resourceOrganisationId && scopeContext.resourceOrganisationId !== user.organisationId) {
    return false;
  }

  const unscopedAllowed = hasPermission(user, permission);

  // If the user has an organisation-level scope for this module, allow without needing context.
  const organisationScope = user.dataScopes.some(
    (s) => matchesModule(s, permission) && s.scope === 'organisation',
  );
  if (organisationScope) return true;

  // If no scope context is provided, fall back to permission-only checks.
  if (!scopeContext) {
    return unscopedAllowed;
  }

  // If the user only has the permission and no scopes are configured, allow.
  if (unscopedAllowed && user.dataScopes.length === 0) {
    return true;
  }

  // Evaluate data scopes. The user must have both the permission and a matching scope.
  const relevantScopes = user.dataScopes.filter((s) => matchesModule(s, permission));
  if (relevantScopes.length === 0) {
    return unscopedAllowed;
  }

  const actors = new Set(scopeContext.actorIds ?? []);

  return relevantScopes.some((scope) => {
    switch (scope.scope) {
      case 'organisation':
        return true;
      case 'own':
        return actors.has(user.id);
      case 'assigned':
        return actors.has(user.id);
      case 'team':
        if (!scopeContext.teamMemberIds) return false;
        return scopeContext.teamMemberIds.some((id) => actors.has(id));
      case 'department':
        if (scope.scopeValue && scopeContext.resourceDepartmentId && scope.scopeValue === scopeContext.resourceDepartmentId) {
          return true;
        }
        if (!scopeContext.departmentMemberIds) return false;
        return scopeContext.departmentMemberIds.some((id) => actors.has(id));
      default:
        return false;
    }
  });
}

export function requirePermission(
  user: AuthorizableUser,
  permission: string,
  scopeContext?: ScopeContext,
): void {
  if (!can(user, permission, scopeContext)) {
    throw new AuthorizationError(`Permission denied: ${permission}`, permission);
  }
}

export function getScopeTypesForPermission(
  user: AuthorizableUser,
  permission: string,
): ScopeType[] {
  if (user.isSuperAdmin) return ['organisation'];
  return user.dataScopes
    .filter((s) => matchesModule(s, permission))
    .map((s) => s.scope);
}

export function hasAnyPermission(
  user: AuthorizableUser,
  permissions: string[],
): boolean {
  return permissions.some((p) => can(user, p));
}
