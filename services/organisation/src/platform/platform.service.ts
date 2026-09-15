import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PlatformAuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

const USER_BATCH_SIZE = 100; // matches auth service findMany cap

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async overview() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [organisations, members, pendingInvitations, recentOrganisations] =
      await Promise.all([
        this.prisma.organisation.count(),
        this.prisma.organisationMembership.count(),
        this.prisma.invitation.count({ where: { status: 'pending' } }),
        this.prisma.organisation.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      ]);
    return { organisations, members, pendingInvitations, recentOrganisations };
  }

  async listOrganisations(options: { search?: string; take: number; skip: number }) {
    const where = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' as const } },
            { slug: { contains: options.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [organisations, total] = await Promise.all([
      this.prisma.organisation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.take,
        skip: options.skip,
        include: {
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.organisation.count({ where }),
    ]);

    const pendingByOrg = await this.prisma.invitation.groupBy({
      by: ['organisationId'],
      where: { organisationId: { in: organisations.map((o) => o.id) }, status: 'pending' },
      _count: { _all: true },
    });
    const pendingMap = new Map(pendingByOrg.map((row) => [row.organisationId, row._count._all]));

    const owners = await this.fetchUsers([...new Set(organisations.map((o) => o.ownerId))]);
    const ownerMap = new Map(owners.map((u) => [u.id, u]));

    return {
      total,
      organisations: organisations.map((org) => {
        const owner = ownerMap.get(org.ownerId);
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdAt: org.createdAt,
          memberCount: org._count.memberships,
          pendingInvitations: pendingMap.get(org.id) ?? 0,
          owner: owner
            ? {
                id: owner.id,
                email: owner.email,
                name: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || null,
                active: owner.active,
              }
            : { id: org.ownerId, email: null, name: null, active: null },
        };
      }),
    };
  }

  async getOrganisation(id: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { id },
      include: { _count: { select: { memberships: true, workspaces: true, roles: true, tickets: true, assets: true } } },
    });
    if (!org) throw new NotFoundException('Organisation not found');

    const [invitationCounts, clients] = await Promise.all([
      this.prisma.invitation.groupBy({
        by: ['status'],
        where: { organisationId: id },
        _count: { _all: true },
      }),
      this.prisma.client.count({ where: { organisationId: id } }),
    ]);

    const owners = await this.fetchUsers([org.ownerId]);
    const owner = owners[0];

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      owner: owner
        ? {
            id: owner.id,
            email: owner.email,
            name: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || null,
            active: owner.active,
            emailVerified: owner.emailVerified,
          }
        : { id: org.ownerId, email: null, name: null, active: null, emailVerified: null },
      counts: {
        members: org._count.memberships,
        workspaces: org._count.workspaces,
        roles: org._count.roles,
        clients,
        tickets: org._count.tickets,
        assets: org._count.assets,
        invitations: Object.fromEntries(invitationCounts.map((row) => [row.status, row._count._all])),
      },
    };
  }

  async listMembers(organisationId: string, options: { take: number; skip: number }) {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, ownerId: true } });
    if (!org) throw new NotFoundException('Organisation not found');

    const [memberships, total] = await Promise.all([
      this.prisma.organisationMembership.findMany({
        where: { organisationId },
        orderBy: { createdAt: 'asc' },
        take: options.take,
        skip: options.skip,
        include: {
          role: { select: { id: true, name: true, roleCategory: true } },
          userRoles: { include: { role: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.organisationMembership.count({ where: { organisationId } }),
    ]);

    const users = await this.fetchUsers(memberships.map((m) => m.userId));
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      total,
      members: memberships.map((membership) => {
        const user = userMap.get(membership.userId);
        return {
          membershipId: membership.id,
          userId: membership.userId,
          isOwner: membership.userId === org.ownerId,
          isGuest: membership.isGuest,
          role: membership.role
            ? { id: membership.role.id, name: membership.role.name, category: membership.role.roleCategory }
            : null,
          extraRoles: membership.userRoles
            .map((ur) => ur.role)
            .filter(Boolean)
            .map((r) => ({ id: r.id, name: r.name })),
          email: user?.email ?? null,
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          active: user?.active ?? null,
          emailVerified: user?.emailVerified ?? null,
          userCreatedAt: user?.createdAt ?? null,
          joinedAt: membership.createdAt,
        };
      }),
    };
  }

  async listInvitations(organisationId: string) {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true } });
    if (!org) throw new NotFoundException('Organisation not found');

    const invitations = await this.prisma.invitation.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
    });

    const roleIds = [...new Set(invitations.map((i) => i.roleId))];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true },
    });
    const roleMap = new Map(roles.map((r) => [r.id, r.name]));

    return {
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        roleName: roleMap.get(invitation.roleId) ?? null,
        userId: invitation.userId,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      })),
    };
  }

  private s2sHeaders(): Record<string, string> {
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!internalApiKey) {
      throw new Error('INTERNAL_API_KEY is not configured');
    }
    return {
      'x-internal-api-key': internalApiKey,
      'x-internal-caller': 'organisation-service',
    };
  }

  private async fetchUsers(ids: string[]): Promise<PlatformAuthUser[]> {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return [];

    const authUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!authUrl) {
      throw new BadGatewayException('Auth service integration is not configured');
    }

    const users: PlatformAuthUser[] = [];
    for (let i = 0; i < uniqueIds.length; i += USER_BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + USER_BATCH_SIZE);
      const res = await fetch(`${authUrl}/auth/internal/users?ids=${batch.map(encodeURIComponent).join(',')}`, {
        headers: this.s2sHeaders(),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => 'User lookup failed');
        throw new BadGatewayException(`User lookup failed: ${body}`);
      }
      users.push(...((await res.json()) as PlatformAuthUser[]));
    }
    return users;
  }
}
