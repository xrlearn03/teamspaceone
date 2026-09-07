import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
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

export interface RoleTemplate {
  name: string;
  label: string;
  isSystem: boolean;
  isDefault?: boolean;
  allow: string[];
  deny?: string[];
  scopes: Array<{ module: string; scope: ScopeType; scopeValue?: string | null }>;
}

export const DEFAULT_ROLES: RoleTemplate[] = [
  {
    name: 'owner',
    label: 'Owner',
    isSystem: true,
    allow: ['*'],
    scopes: [{ module: '*', scope: 'organisation' }],
  },
  {
    name: 'org_admin',
    label: 'Organisation Admin',
    isSystem: true,
    allow: ['*'],
    deny: ['admin.system.settings'],
    scopes: [{ module: '*', scope: 'organisation' }],
  },
  {
    name: 'hr_admin',
    label: 'HR Admin',
    isSystem: true,
    allow: [
      'hrms.*',
      'dashboard.*',
      'admin.audit.view',
      'collaboration.access',
    ],
    scopes: [{ module: 'hrms', scope: 'organisation' }],
  },
  {
    name: 'recruiter',
    label: 'Recruiter',
    isSystem: true,
    allow: [
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
      'collaboration.access',
    ],
    scopes: [{ module: 'interview', scope: 'assigned' }],
  },
  {
    name: 'hiring_manager',
    label: 'Hiring Manager',
    isSystem: true,
    allow: [
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
      'collaboration.access',
    ],
    scopes: [{ module: 'interview', scope: 'assigned' }],
  },
  {
    name: 'manager',
    label: 'Manager',
    isSystem: true,
    allow: [
      'collaboration.*',
      'hrms.access',
      'hrms.employee.view',
      'hrms.attendance.view',
      'hrms.attendance.approve',
      'hrms.leave.view',
      'hrms.leave.approve',
      'hrms.org-chart.view',
      'hrms.performance.view',
      'dashboard.*',
    ],
    scopes: [{ module: 'hrms', scope: 'team' }],
  },
  {
    name: 'employee',
    label: 'Employee',
    isSystem: true,
    isDefault: true,
    allow: [
      'collaboration.access',
      'collaboration.message.*',
      'collaboration.channel.view',
      'collaboration.file.view',
      'collaboration.project.view',
      'collaboration.task.*',
      'collaboration.meeting.view',
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
    ],
    scopes: [{ module: 'hrms', scope: 'own' }],
  },
  {
    name: 'interviewer',
    label: 'Interviewer',
    isSystem: true,
    allow: [
      'interview.interview.view',
      'interview.interview.conduct',
      'interview.interview.evaluate',
      'interview.interview.edit-evaluation',
      'interview.candidate.view',
      'interview.job.view',
      'collaboration.access',
      'dashboard.view',
    ],
    scopes: [{ module: 'interview', scope: 'assigned' }],
  },
  {
    name: 'candidate',
    label: 'Candidate',
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

  async createRole(
    organisationId: string,
    input: {
      name: string;
      description?: string;
      permissionIds: string[];
      scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }>;
    },
  ): Promise<Role> {
    const { name, description, permissionIds, scopes } = input;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.role.findFirst({ where: { organisationId, name } });
      if (existing) throw new Error('A role with this name already exists');

      const role = await tx.role.create({
        data: {
          id: randomUUID(),
          organisationId,
          name,
          description: description ?? null,
          isSystem: false,
          isDefault: false,
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

      return role;
    });
  }

  async updateRole(
    roleId: string,
    organisationId: string,
    input: {
      name?: string;
      description?: string;
      permissionIds?: string[];
      scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }>;
    },
  ): Promise<Role> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, organisationId },
        include: { rolePermissions: true, roleScopes: true },
      });
      if (!role) throw new Error('Role not found');
      if (role.isSystem) throw new Error('System roles cannot be edited');

      if (input.name) {
        const existing = await tx.role.findFirst({
          where: { organisationId, name: input.name, id: { not: roleId } },
        });
        if (existing) throw new Error('A role with this name already exists');
      }

      const updated = await tx.role.update({
        where: { id: roleId },
        data: {
          name: input.name,
          description: input.description ?? role.description,
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

      return updated;
    });
  }

  async deleteRole(roleId: string, organisationId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, organisationId },
        include: { _count: { select: { memberships: true } } },
      });
      if (!role) throw new Error('Role not found');
      if (role.isSystem) throw new Error('System roles cannot be deleted');
      if ((role._count as { memberships: number }).memberships > 0) {
        throw new Error('Cannot delete a role that has members assigned to it');
      }
      await tx.role.delete({ where: { id: roleId } });
    });
  }

  async assignMembershipRole(
    organisationId: string,
    membershipId: string,
    roleId: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const [membership, role] = await Promise.all([
        tx.organisationMembership.findFirst({ where: { id: membershipId, organisationId } }),
        tx.role.findFirst({ where: { id: roleId, organisationId } }),
      ]);
      if (!membership) throw new Error('Membership not found');
      if (!role) throw new Error('Role not found');

      await tx.organisationMembership.update({
        where: { id: membershipId },
        data: { roleId },
      });

      await tx.dataScope.deleteMany({ where: { membershipId } });
      await this.applyRoleScopesToMembership(tx, membershipId, roleId, organisationId);
    });
  }
}
