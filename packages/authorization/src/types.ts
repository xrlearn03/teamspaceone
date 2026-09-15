export type ScopeType = 'own' | 'assigned' | 'team' | 'department' | 'organisation';

export interface DataScope {
  /** The module this scope applies to, e.g. "hrms" or "interview" or "*" for all. */
  module: string;
  scope: ScopeType;
  /** Optional qualifier, e.g. a department id when scope is "department". */
  scopeValue?: string | null;
}

export interface RoleContext {
  id: string;
  name: string;
  isSystem?: boolean;
  permissions: string[];
}

export interface AuthorizableUser {
  id: string;
  organisationId: string;
  /** Flat list of effective permission strings, including wildcards. */
  permissions: string[];
  /** Data scopes that constrain how those permissions apply. */
  dataScopes: DataScope[];
  /** Optional super-admin flag that bypasses scope checks but is still audited. */
  isSuperAdmin?: boolean;
  /** Primary role name for display/gating (e.g. "Organisation Super Admin"). */
  roleName?: string;
  /** Primary role category (administrative, managerial, employee, ...). */
  roleCategory?: string;
  /** All role ids the user holds in this organisation (primary + extra). */
  roleIds?: string[];
  /** True when the context organisation is the dedicated platform org (PLATFORM_ORGANISATION_SLUG). */
  isPlatformOrganisation?: boolean;
}

export interface ScopeContext {
  /** UserIds associated with the resource: owner, assignee, participant, etc. */
  actorIds?: string[];
  /** UserIds that belong to the requesting user's team (for team scope). */
  teamMemberIds?: string[];
  /** UserIds that belong to the requesting user's department (for department scope). */
  departmentMemberIds?: string[];
  /** Department id of the resource (for department scope). */
  resourceDepartmentId?: string;
  /** Organisation id of the resource. Must match user.organisationId. */
  resourceOrganisationId?: string;
}
