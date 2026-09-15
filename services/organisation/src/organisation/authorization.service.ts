import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient, type Role, type OrganisationMembership } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ALL_PERMISSIONS,
  permissionMatches,
  permissionKey,
  type AuthorizableUser,
  type DataScope,
  type ScopeType,
} from '@teamspace-one/authorization';

export const ROLE_CATEGORIES = [
  'administrative',
  'managerial',
  'employee',
  'member',
  'external',
  'candidate',
  'guest',
] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

/**
 * Categories the Organisation Super Admin may create/assign through the
 * administrative role-management interface. Everything else is handled by a
 * dedicated workflow (HR onboarding, member invitation, external access,
 * recruitment/ATS, guest invitation).
 */
export const ADMIN_MANAGED_ROLE_CATEGORIES: readonly RoleCategory[] = [
  'administrative',
  'managerial',
];

/** Categories that may be attached to an invitation (invitation workflows). */
export const INVITABLE_ROLE_CATEGORIES: readonly RoleCategory[] = [
  'administrative',
  'managerial',
  'member',
  'external',
  'guest',
];

/** Platform-level permissions can never be granted to organisation roles. */
const PLATFORM_PERMISSION_KEYS = new Set(['admin.system.settings']);

const RESERVED_ROLE_NAMES = new Set([
  'platform super admin',
  'platform_super_admin',
  'platform-super-admin',
  'platform admin',
  'platform_admin',
]);

export function isRoleCategory(value: string): value is RoleCategory {
  return (ROLE_CATEGORIES as readonly string[]).includes(value);
}

export function assertAdminManagedCategory(category: string): void {
  if (!ADMIN_MANAGED_ROLE_CATEGORIES.includes(category as RoleCategory)) {
    throw new BadRequestException(
      `Roles in the "${category}" category cannot be created or assigned through administrative role management. Employee and member access is managed through the appropriate onboarding workflow.`,
    );
  }
}

export function assertInvitableCategory(category: string): void {
  if (!INVITABLE_ROLE_CATEGORIES.includes(category as RoleCategory)) {
    throw new BadRequestException(
      `Roles in the "${category}" category cannot be assigned through invitations. Employee access is managed through the HR onboarding workflow and candidate access through the recruitment workflow.`,
    );
  }
}

export function assertRoleNameAllowed(name: string): void {
  if (RESERVED_ROLE_NAMES.has(name.trim().toLowerCase())) {
    throw new BadRequestException('This role name is reserved for platform-level administration');
  }
}

export interface RoleTemplate {
  name: string;
  label: string;
  category: RoleCategory;
  isSystem: boolean;
  isDefault?: boolean;
  allow: string[];
  deny?: string[];
  scopes: Array<{ module: string; scope: ScopeType; scopeValue?: string | null }>;
}

/**
 * Common surface every internal staff role shares: channels, messages/DMs,
 * meetings/calls, files, projects & tasks, tickets, and self-service HRMS
 * (own attendance, leaves, payslips, documents, performance). HRMS data
 * scopes keep these limited to the member's own records unless the role
 * grants a wider scope. External-facing roles (candidate, client/guest)
 * intentionally exclude it.
 */
const STAFF_BASELINE_ALLOW: readonly string[] = [
  'collaboration.access',
  'collaboration.message.*',
  'collaboration.channel.view',
  'collaboration.file.view',
  'collaboration.file.upload',
  'collaboration.project.view',
  'collaboration.task.*',
  'collaboration.meeting.view',
  'collaboration.meeting.create',
  'collaboration.meeting.conduct',
  'collaboration.ticket.view',
  'collaboration.ticket.create',
  'hrms.access',
  'hrms.employee.view',
  'hrms.attendance.view',
  'hrms.attendance.checkin',
  'hrms.attendance.checkout',
  'hrms.leave.view',
  'hrms.leave.apply',
  'hrms.document.view',
  'hrms.payroll.view',
  'hrms.onboarding.view',
  'hrms.performance.view',
  'dashboard.view',
];

export const DEFAULT_ROLES: RoleTemplate[] = [
  {
    name: 'owner',
    label: 'Organisation Super Admin',
    category: 'administrative',
    isSystem: true,
    allow: ['*'],
    scopes: [{ module: '*', scope: 'organisation' }],
  },
  {
    name: 'org_admin',
    label: 'Organisation Admin',
    category: 'administrative',
    isSystem: true,
    allow: ['*'],
    deny: ['admin.system.settings'],
    scopes: [{ module: '*', scope: 'organisation' }],
  },
  {
    name: 'hr_admin',
    label: 'HR Admin',
    category: 'administrative',
    isSystem: true,
    allow: [
      'hrms.*',
      'interview.*',
      'dashboard.*',
      'admin.audit.view',
      'collaboration.*',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'recruiter',
    label: 'Recruiter',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'interview.candidate.*',
      'interview.job.view',
      'interview.screening.run',
      'interview.screening.view',
      'interview.template.view',
      'interview.template.create',
      'interview.template.edit',
      'interview.interview.view',
      'interview.interview.schedule',
      'interview.interview.conduct',
      'interview.interview.evaluate',
      'interview.interview.edit-evaluation',
      'interview.decision.view',
      'dashboard.*',
    ],
    scopes: [
      { module: 'interview', scope: 'assigned' },
      { module: 'hrms', scope: 'own' },
    ],
  },
  {
    name: 'hiring_manager',
    label: 'Hiring Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'interview.candidate.view',
      'interview.job.view',
      'interview.screening.view',
      'interview.template.view',
      'interview.interview.view',
      'interview.interview.schedule',
      'interview.interview.conduct',
      'interview.interview.evaluate',
      'interview.interview.approve',
      'interview.interview.edit-evaluation',
      'interview.decision.view',
      'interview.decision.make',
      'interview.analytics.view',
      'dashboard.*',
    ],
    scopes: [
      { module: 'interview', scope: 'assigned' },
      { module: 'hrms', scope: 'own' },
    ],
  },
  {
    name: 'hr_manager',
    label: 'HR Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'hrms.employee.*',
      'hrms.department.view',
      'hrms.designation.view',
      'hrms.org-chart.view',
      'hrms.attendance.*',
      'hrms.leave.*',
      'hrms.payroll.process',
      'hrms.payroll.export',
      'hrms.document.*',
      'hrms.recruitment.view',
      'hrms.onboarding.*',
      'hrms.offboarding.*',
      'hrms.performance.*',
      'hrms.analytics.view',
      'interview.job.view',
      'dashboard.*',
      'collaboration.ticket.manage',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'manager',
    label: 'Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'collaboration.*',
      'hrms.attendance.approve',
      'hrms.leave.approve',
      'hrms.org-chart.view',
      'hrms.offboarding.view',
      'hrms.performance.manage',
      'hrms.analytics.view',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'team' }],
  },
  {
    name: 'department_manager',
    label: 'Department Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'collaboration.*',
      'hrms.department.view',
      'hrms.attendance.approve',
      'hrms.leave.approve',
      'hrms.org-chart.view',
      'hrms.offboarding.view',
      'hrms.performance.manage',
      'hrms.analytics.view',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'department' }],
  },
  {
    name: 'team_lead',
    label: 'Team Lead',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'collaboration.channel.*',
      'collaboration.file.*',
      'collaboration.project.*',
      'collaboration.meeting.*',
      'hrms.leave.approve',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'team' }],
  },
  {
    name: 'finance_admin',
    label: 'Finance Admin',
    category: 'administrative',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'hrms.payroll.*',
      'hrms.analytics.view',
      'hrms.analytics.export',
      'admin.organization.billing',
      'admin.audit.view',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'finance_manager',
    label: 'Finance Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'hrms.payroll.process',
      'hrms.payroll.export',
      'hrms.analytics.view',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'payroll_admin',
    label: 'Payroll Admin',
    category: 'administrative',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'hrms.payroll.*',
      'hrms.analytics.view',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'payroll_manager',
    label: 'Payroll Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'hrms.payroll.process',
      'hrms.payroll.export',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'project_manager',
    label: 'Project Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'collaboration.*',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'own' }],
  },
  {
    name: 'operations_manager',
    label: 'Operations Manager',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'collaboration.*',
      'hrms.department.view',
      'hrms.org-chart.view',
      'hrms.analytics.view',
      'admin.organization.settings',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'employee',
    label: 'Employee',
    category: 'employee',
    isSystem: true,
    isDefault: true,
    allow: [...STAFF_BASELINE_ALLOW],
    scopes: [{ module: 'hrms', scope: 'own' }],
  },
  {
    name: 'interviewer',
    label: 'Interviewer',
    category: 'managerial',
    isSystem: true,
    allow: [
      ...STAFF_BASELINE_ALLOW,
      'interview.interview.view',
      'interview.interview.conduct',
      'interview.interview.evaluate',
      'interview.interview.edit-evaluation',
      'interview.candidate.view',
      'interview.job.view',
    ],
    scopes: [
      { module: 'interview', scope: 'assigned' },
      { module: 'hrms', scope: 'own' },
    ],
  },
  {
    name: 'candidate',
    label: 'Candidate',
    category: 'candidate',
    isSystem: true,
    allow: [
      'interview.access',
      'interview.job.view',
      'interview.candidate.view',
      'interview.interview.view',
      'dashboard.view',
    ],
    scopes: [{ module: 'interview', scope: 'own' }],
  },
  {
    name: 'client',
    label: 'Client / Guest',
    category: 'guest',
    isSystem: true,
    allow: [
      'collaboration.access',
      'collaboration.project.view',
      'collaboration.file.view',
      'collaboration.message.send',
      'collaboration.message.view',
      'collaboration.meeting.view',
      'dashboard.view',
    ],
    scopes: [],
  },
];

export function expandPermissions(
  allow: string[],
  deny: string[] = [],
): Set<string> {
  const denied = new Set(ALL_PERMISSIONS.filter((p) => deny.some((d) => permissionMatches(d, p))));
  const allowed = new Set(ALL_PERMISSIONS.filter((p) => allow.some((a) => permissionMatches(a, p)) && !denied.has(p)));
  return allowed;
}

@Injectable()
export class AuthorizationService {
  private readonly defaultRoles = DEFAULT_ROLES;

  constructor(private readonly prisma: PrismaService) {}

  getDefaultRoleNames(): string[] {
    return this.defaultRoles.map((r) => r.name);
  }

  async createDefaultRoles(
    organisationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Role[]> {
    const allPermissions = await tx.permission.findMany();
    const permissionMap = new Map(
      allPermissions.map((p) => [permissionKey(p.module, p.resource, p.action), p.id]),
    );

    const createdRoles: Role[] = [];

    for (const template of this.defaultRoles) {
      const role = await tx.role.create({
        data: {
          organisationId,
          name: template.name,
          description: template.label,
          roleCategory: template.category,
          isSystem: template.isSystem,
          isDefault: template.isDefault ?? false,
          // Keep legacy JSON empty; permissions now live in rolePermissions.
          permissions: [],
        },
      });

      const concrete = expandPermissions(template.allow, template.deny ?? []);
      const permissionIds: string[] = [];
      for (const permission of concrete) {
        const permissionId = permissionMap.get(permission);
        if (permissionId) {
          permissionIds.push(permissionId);
        }
      }

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }

      if (template.scopes.length > 0) {
        await tx.roleScope.createMany({
          data: template.scopes.map((s) => ({
            roleId: role.id,
            module: s.module,
            scope: s.scope,
            scopeValue: s.scopeValue ?? null,
          })),
        });
      }

      createdRoles.push(role);
    }

    return createdRoles;
  }

  async applyRoleScopesToMembership(
    tx: Prisma.TransactionClient,
    membershipId: string,
    roleId: string,
    organisationId: string,
  ): Promise<void> {
    const roleScopes = await tx.roleScope.findMany({ where: { roleId } });
    if (roleScopes.length === 0) return;

    await tx.dataScope.createMany({
      data: roleScopes.map((s) => ({
        membershipId,
        module: s.module,
        scope: s.scope,
        scopeValue: s.scopeValue,
      })),
      skipDuplicates: true,
    });
  }

  async getUserContext(
    prisma: PrismaClient | Prisma.TransactionClient,
    organisationId: string,
    userId: string,
  ): Promise<AuthorizableUser | null> {
    const [org, membership] = await Promise.all([
      prisma.organisation.findUnique({ where: { id: organisationId } }),
      prisma.organisationMembership.findUnique({
        where: { userId_organisationId: { userId, organisationId } },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
              roleScopes: true,
            },
          },
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: { include: { permission: true } },
                  roleScopes: true,
                },
              },
            },
          },
          dataScopes: true,
        },
      }),
    ]);

    if (!org) return null;

    // Organisation owner bypasses role checks but is still scoped to the org.
    if (org.ownerId === userId) {
      return {
        id: userId,
        organisationId,
        permissions: ['*'],
        dataScopes: [{ module: '*', scope: 'organisation' }],
        isSuperAdmin: true,
        roleName: 'Organisation Super Admin',
        roleCategory: 'administrative',
      };
    }

    if (!membership) return null;

    const permissionSet = new Set<string>();
    const dataScopeSet = new Set<DataScope>();

    const collectFromRole = (role: Role & { rolePermissions: Array<{ permission: { module: string; resource: string; action: string } }>; roleScopes: Array<{ module: string; scope: string; scopeValue: string | null }> }) => {
      for (const rp of role.rolePermissions) {
        permissionSet.add(permissionKey(rp.permission.module, rp.permission.resource, rp.permission.action));
      }
      for (const rs of role.roleScopes) {
        dataScopeSet.add({
          module: rs.module,
          scope: rs.scope as ScopeType,
          scopeValue: rs.scopeValue,
        });
      }
    };

    collectFromRole(membership.role as unknown as Parameters<typeof collectFromRole>[0]);

    for (const userRole of membership.userRoles) {
      collectFromRole(userRole.role as unknown as Parameters<typeof collectFromRole>[0]);
    }

    for (const ds of membership.dataScopes) {
      dataScopeSet.add({
        module: ds.module,
        scope: ds.scope as ScopeType,
        scopeValue: ds.scopeValue,
      });
    }

    return {
      id: userId,
      organisationId,
      permissions: Array.from(permissionSet),
      dataScopes: Array.from(dataScopeSet),
      isSuperAdmin: permissionSet.has('*'),
      roleName: membership.role?.name,
      roleCategory: membership.role?.roleCategory,
      roleIds: [
        membership.roleId,
        ...membership.userRoles.map((ur) => ur.roleId),
      ].filter(Boolean),
    };
  }

  /**
   * Resolve the effective authorisation context for a membership, used when
   * the caller already has the membership record.
   */
  buildContextFromMembership(membership: OrganisationMembership & { role?: { rolePermissions?: Array<{ permission: { module: string; resource: string; action: string } }>; roleScopes?: Array<{ module: string; scope: string; scopeValue: string | null }> }; userRoles?: Array<{ role: { rolePermissions?: Array<{ permission: { module: string; resource: string; action: string } }>; roleScopes?: Array<{ module: string; scope: string; scopeValue: string | null }> } }>; dataScopes?: Array<{ module: string; scope: string; scopeValue: string | null }> }): AuthorizableUser {
    const permissionSet = new Set<string>();
    const dataScopeSet = new Set<DataScope>();

    const collectFromRole = (role: { rolePermissions?: Array<{ permission: { module: string; resource: string; action: string } }>; roleScopes?: Array<{ module: string; scope: string; scopeValue: string | null }> }) => {
      for (const rp of role.rolePermissions ?? []) {
        permissionSet.add(permissionKey(rp.permission.module, rp.permission.resource, rp.permission.action));
      }
      for (const rs of role.roleScopes ?? []) {
        dataScopeSet.add({
          module: rs.module,
          scope: rs.scope as ScopeType,
          scopeValue: rs.scopeValue,
        });
      }
    };

    if (membership.role) collectFromRole(membership.role);
    for (const userRole of membership.userRoles ?? []) {
      if (userRole.role) collectFromRole(userRole.role);
    }
    for (const ds of membership.dataScopes ?? []) {
      dataScopeSet.add({
        module: ds.module,
        scope: ds.scope as ScopeType,
        scopeValue: ds.scopeValue,
      });
    }

    return {
      id: membership.userId,
      organisationId: membership.organisationId,
      permissions: Array.from(permissionSet),
      dataScopes: Array.from(dataScopeSet),
    };
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
    });
  }

  /**
   * Hierarchical delegation check: an actor may only grant permissions they
   * hold themselves. Organisation owners ('*') are still blocked from
   * platform-level permissions such as `admin.system.settings`.
   */
  private async assertCanDelegatePermissions(
    tx: Prisma.TransactionClient,
    organisationId: string,
    actorId: string,
    permissionIds: string[],
  ): Promise<void> {
    if (permissionIds.length === 0) return;

    const permissions = await tx.permission.findMany({
      where: { id: { in: permissionIds } },
    });
    if (permissions.length !== new Set(permissionIds).size) {
      throw new BadRequestException('Unknown permission id(s)');
    }

    const requestedKeys = permissions.map((p) =>
      permissionKey(p.module, p.resource, p.action),
    );
    if (requestedKeys.some((key) => PLATFORM_PERMISSION_KEYS.has(key))) {
      throw new ForbiddenException('Platform-level permissions cannot be granted to organisation roles');
    }

    const actor = await this.getUserContext(tx, organisationId, actorId);
    if (!actor) {
      throw new ForbiddenException('Not a member of this organisation');
    }
    if (actor.permissions.includes('*')) return;

    const missing = requestedKeys.filter(
      (key) => !actor.permissions.some((granted) => permissionMatches(granted, key)),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Cannot grant permissions beyond your own authority: ${missing.join(', ')}`,
      );
    }
  }

  private async writeAuditLog(
    tx: Prisma.TransactionClient,
    entry: {
      organisationId: string;
      userId: string;
      action: string;
      resourceId: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        id: randomUUID(),
        organisationId: entry.organisationId,
        userId: entry.userId,
        action: entry.action,
        resourceType: 'role',
        resourceId: entry.resourceId,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async createRole(
    organisationId: string,
    input: {
      name: string;
      description?: string;
      roleCategory: string;
      permissionIds: string[];
      scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }>;
    },
    actorId: string,
  ): Promise<Role> {
    const { name, description, roleCategory, permissionIds, scopes } = input;
    if (!isRoleCategory(roleCategory)) {
      throw new BadRequestException(
        `Invalid role category "${roleCategory}". Allowed values: ${ROLE_CATEGORIES.join(', ')}`,
      );
    }
    assertAdminManagedCategory(roleCategory);
    assertRoleNameAllowed(name);
    return this.prisma.$transaction(async (tx) => {
      await this.assertCanDelegatePermissions(tx, organisationId, actorId, permissionIds);

      const existing = await tx.role.findFirst({ where: { organisationId, name } });
      if (existing) throw new BadRequestException('A role with this name already exists');

      const role = await tx.role.create({
        data: {
          id: randomUUID(),
          organisationId,
          name,
          description: description ?? null,
          roleCategory,
          isSystem: false,
          isDefault: false,
          createdBy: actorId,
          permissions: [],
        },
      });

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            id: randomUUID(),
            roleId: role.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }

      if (scopes && scopes.length > 0) {
        await tx.roleScope.createMany({
          data: scopes.map((s) => ({
            id: randomUUID(),
            roleId: role.id,
            module: s.module,
            scope: s.scope,
            scopeValue: s.scopeValue ?? null,
          })),
        });
      }

      await this.writeAuditLog(tx, {
        organisationId,
        userId: actorId,
        action: 'role.created',
        resourceId: role.id,
        metadata: { name, roleCategory },
      });

      return role;
    });
  }

  async updateRole(
    roleId: string,
    organisationId: string,
    input: {
      name?: string;
      description?: string;
      roleCategory?: string;
      permissionIds?: string[];
      scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }>;
    },
    actorId: string,
  ): Promise<Role> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, organisationId },
        include: { rolePermissions: true, roleScopes: true },
      });
      if (!role) throw new BadRequestException('Role not found');
      if (role.isSystem) throw new ForbiddenException('System roles cannot be edited');
      assertAdminManagedCategory(role.roleCategory);

      if (input.roleCategory !== undefined && input.roleCategory !== role.roleCategory) {
        if (!isRoleCategory(input.roleCategory)) {
          throw new BadRequestException(
            `Invalid role category "${input.roleCategory}". Allowed values: ${ROLE_CATEGORIES.join(', ')}`,
          );
        }
        assertAdminManagedCategory(input.roleCategory);
      }

      if (input.name) {
        assertRoleNameAllowed(input.name);
        const existing = await tx.role.findFirst({
          where: { organisationId, name: input.name, id: { not: roleId } },
        });
        if (existing) throw new BadRequestException('A role with this name already exists');
      }

      if (input.permissionIds !== undefined) {
        await this.assertCanDelegatePermissions(tx, organisationId, actorId, input.permissionIds);
      }

      const updated = await tx.role.update({
        where: { id: roleId },
        data: {
          name: input.name,
          description: input.description ?? role.description,
          roleCategory: input.roleCategory ?? role.roleCategory,
        },
      });

      if (input.permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (input.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: input.permissionIds.map((permissionId) => ({
              id: randomUUID(),
              roleId,
              permissionId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (input.scopes !== undefined) {
        await tx.roleScope.deleteMany({ where: { roleId } });
        if (input.scopes.length > 0) {
          await tx.roleScope.createMany({
            data: input.scopes.map((s) => ({
              id: randomUUID(),
              roleId,
              module: s.module,
              scope: s.scope,
              scopeValue: s.scopeValue ?? null,
            })),
          });
        }
      }

      await this.writeAuditLog(tx, {
        organisationId,
        userId: actorId,
        action: 'role.updated',
        resourceId: roleId,
        metadata: { name: updated.name, roleCategory: updated.roleCategory },
      });

      return updated;
    });
  }

  async deleteRole(roleId: string, organisationId: string, actorId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, organisationId },
        include: { _count: { select: { memberships: true } } },
      });
      if (!role) throw new BadRequestException('Role not found');
      if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');
      assertAdminManagedCategory(role.roleCategory);
      if ((role._count as { memberships: number }).memberships > 0) {
        throw new BadRequestException('Cannot delete a role that has members assigned to it');
      }
      await tx.role.delete({ where: { id: roleId } });
      await this.writeAuditLog(tx, {
        organisationId,
        userId: actorId,
        action: 'role.deleted',
        resourceId: roleId,
        metadata: { name: role.name, roleCategory: role.roleCategory },
      });
    });
  }

  async assignMembershipRole(
    organisationId: string,
    membershipId: string,
    roleId: string,
    actorId: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const [membership, role] = await Promise.all([
        tx.organisationMembership.findFirst({ where: { id: membershipId, organisationId } }),
        tx.role.findFirst({ where: { id: roleId, organisationId } }),
      ]);
      if (!membership) throw new BadRequestException('Membership not found');
      if (!role) throw new BadRequestException('Role not found');
      assertAdminManagedCategory(role.roleCategory);

      await tx.organisationMembership.update({
        where: { id: membershipId },
        data: { roleId },
      });

      await tx.dataScope.deleteMany({ where: { membershipId } });
      await this.applyRoleScopesToMembership(tx, membershipId, roleId, organisationId);
      await this.writeAuditLog(tx, {
        organisationId,
        userId: actorId,
        action: 'role.assigned',
        resourceId: roleId,
        metadata: { membershipId, memberUserId: membership.userId, roleName: role.name },
      });
    });
  }
}
