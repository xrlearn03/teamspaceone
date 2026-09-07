import { BadRequestException, Injectable, NotFoundException, ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { Prisma, type Organisation } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AuthorizationService } from './authorization.service.js';
import { type CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { type CreateMemberDto } from './dto/create-member.dto.js';
import { type CreateInvitationDto } from './dto/create-invitation.dto.js';
import { type CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { type CreateClientDto } from './dto/create-client.dto.js';
import { type UpdateClientDto } from './dto/update-client.dto.js';

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

@Injectable()
export class OrganisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly authorization: AuthorizationService,
  ) {}

  async create(
    dto: CreateOrganisationDto,
    ownerId: string,
    correlationId?: string,
  ): Promise<{ organisation: Organisation; membership: unknown }> {
    const existing = await this.prisma.organisation.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Organisation slug already in use');
    }

    const id = randomUUID();

    const orgEnvelope = createEventEnvelope({
      eventType: Subjects.ORGANISATION_CREATED,
      organisationId: id,
      actorId: ownerId,
      resourceType: 'organisation',
      resourceId: id,
      correlationId,
      payload: { id, name: dto.name, slug: dto.slug, ownerId },
    });

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const org = await tx.organisation.create({
        data: {
          id,
          name: dto.name,
          slug: dto.slug,
          ownerId,
        },
      });

      const defaultRoles = await this.authorization.createDefaultRoles(id, tx);
      const ownerRole = defaultRoles.find((r) => r.name === 'owner');
      if (!ownerRole) {
        throw new Error('Owner role was not seeded');
      }

      const membership = await tx.organisationMembership.create({
        data: {
          id: randomUUID(),
          userId: ownerId,
          organisationId: id,
          roleId: ownerRole.id,
        },
      });

      await this.authorization.applyRoleScopesToMembership(tx, membership.id, ownerRole.id, id);

      await this.outbox.createEvent(tx, orgEnvelope, Subjects.ORGANISATION_CREATED);

      return { organisation: org, membership };
    });

    return result;
  }

  async addMember(
    organisationId: string,
    dto: CreateMemberDto,
    actorId: string,
  ): Promise<unknown> {
    await this.assertCanManageMembers(organisationId, actorId);

    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, organisationId },
    });
    if (!role) {
      throw new BadRequestException('Role does not belong to this organisation');
    }

    const membership = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.organisationMembership.findUnique({
        where: { userId_organisationId: { userId: dto.userId, organisationId } },
      });
      if (existing) {
        throw new ConflictException('User is already a member');
      }

      const created = await tx.organisationMembership.create({
        data: {
          id: randomUUID(),
          userId: dto.userId,
          organisationId,
          roleId: dto.roleId,
        },
      });

      await this.authorization.applyRoleScopesToMembership(tx, created.id, dto.roleId, organisationId);

      const envelope = createEventEnvelope({
        eventType: Subjects.ORGANISATION_MEMBER_ADDED,
        organisationId,
        actorId,
        resourceType: 'organisation-membership',
        resourceId: created.id,
        payload: { organisationId, userId: dto.userId, roleId: dto.roleId },
      });

      await this.outbox.createEvent(tx, envelope, Subjects.ORGANISATION_MEMBER_ADDED);

      return created;
    });

    return membership;
  }

  async createWorkspace(
    organisationId: string,
    dto: CreateWorkspaceDto,
    actorId: string,
  ): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const workspace = await tx.workspace.create({
        data: {
          id: randomUUID(),
          organisationId,
          name: dto.name,
        },
      });

      const envelope = createEventEnvelope({
        eventType: Subjects.WORKSPACE_CREATED,
        organisationId,
        actorId,
        resourceType: 'workspace',
        resourceId: workspace.id,
        payload: { id: workspace.id, organisationId, name: dto.name },
      });

      await this.outbox.createEvent(tx, envelope, Subjects.WORKSPACE_CREATED);

      return workspace;
    });

    return result;
  }

  async createInvitation(
    organisationId: string,
    dto: CreateInvitationDto,
    actorId: string,
  ): Promise<unknown> {
    await this.assertCanManageMembers(organisationId, actorId);

    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, organisationId },
    });
    if (!role) {
      throw new BadRequestException('Role does not belong to this organisation');
    }

    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, organisationId },
      });
      if (!client) {
        throw new BadRequestException('Client does not belong to this organisation');
      }
    }

    const id = randomUUID();
    const token = randomUUID();
    const expiresAt = hoursFromNow(168);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invitation = await tx.invitation.create({
        data: { id, organisationId, email: dto.email.toLowerCase().trim(), clientId: dto.clientId, roleId: dto.roleId, token, expiresAt },
      });
      const envelope = createEventEnvelope({
        eventType: Subjects.GUEST_INVITED,
        organisationId,
        actorId,
        resourceType: 'invitation',
        resourceId: id,
        payload: { email: invitation.email, clientId: invitation.clientId ?? undefined, organisationId, invitedBy: actorId, token, expiresAt: expiresAt.toISOString() },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.GUEST_INVITED);
      return invitation;
    });
  }

  async listWorkspaces(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.prisma.workspace.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listClients(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.prisma.client.findMany({ where: { organisationId }, orderBy: { updatedAt: 'desc' } });
  }

  async createClient(organisationId: string, actorId: string, dto: CreateClientDto): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);
    const name = dto.name?.trim();
    if (!name || name.length > 200) throw new BadRequestException('Client name must be between 1 and 200 characters');
    const id = randomUUID();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const client = await tx.client.create({ data: { id, organisationId, name, email: dto.email?.trim().toLowerCase(), clientOrganisationId: dto.clientOrganisationId } });
      const envelope = createEventEnvelope({ eventType: Subjects.CLIENT_CREATED, organisationId, actorId, resourceType: 'client', resourceId: id, payload: { clientId: id, organisationId, name, email: client.email ?? undefined, clientOrganisationId: client.clientOrganisationId ?? undefined } });
      await this.outbox.createEvent(tx, envelope, Subjects.CLIENT_CREATED);
      return client;
    });
  }

  async updateClient(organisationId: string, clientId: string, actorId: string, dto: UpdateClientDto): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);
    const existing = await this.prisma.client.findFirst({ where: { id: clientId, organisationId } });
    if (!existing) throw new NotFoundException('Client not found');
    const data: { name?: string; email?: string | null; clientOrganisationId?: string | null } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name || name.length > 200) throw new BadRequestException('Invalid client name');
      data.name = name;
    }
    if (dto.email !== undefined) data.email = dto.email?.trim().toLowerCase() || null;
    if (dto.clientOrganisationId !== undefined) data.clientOrganisationId = dto.clientOrganisationId;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const client = await tx.client.update({ where: { id: clientId }, data });
      const envelope = createEventEnvelope({ eventType: Subjects.CLIENT_UPDATED, organisationId, actorId, resourceType: 'client', resourceId: clientId, payload: client });
      await this.outbox.createEvent(tx, envelope, Subjects.CLIENT_UPDATED);
      return client;
    });
  }

  async deleteClient(organisationId: string, clientId: string, actorId: string): Promise<void> {
    await this.assertMemberOf(organisationId, actorId);
    const client = await this.prisma.client.findFirst({ where: { id: clientId, organisationId } });
    if (!client) throw new NotFoundException('Client not found');
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.client.delete({ where: { id: clientId } });
      const envelope = createEventEnvelope({ eventType: Subjects.CLIENT_DELETED, organisationId, actorId, resourceType: 'client', resourceId: clientId, payload: { id: clientId } });
      await this.outbox.createEvent(tx, envelope, Subjects.CLIENT_DELETED);
    });
  }

  async listInvitations(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.prisma.invitation.findMany({ where: { organisationId }, orderBy: { createdAt: 'desc' } });
  }

  async getInvitationByToken(token: string): Promise<{ id: string; organisationId: string; clientId: string | null; email: string; roleId: string; status: string; expiresAt: Date } | null> {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation) return null;
    return {
      id: invitation.id,
      organisationId: invitation.organisationId,
      clientId: invitation.clientId,
      email: invitation.email,
      roleId: invitation.roleId,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(token: string, userId: string): Promise<unknown> {
    if (!token?.trim()) throw new BadRequestException('Invitation token is required');
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.status !== 'pending') throw new NotFoundException('Invitation not found');
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'expired' } });
      throw new GoneException('Invitation has expired');
    }
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const membership = await tx.organisationMembership.upsert({
        where: { userId_organisationId: { userId, organisationId: invitation.organisationId } },
        create: { id: randomUUID(), userId, organisationId: invitation.organisationId, clientId: invitation.clientId, roleId: invitation.roleId, isGuest: true },
        update: {},
      });

      await this.authorization.applyRoleScopesToMembership(tx, membership.id, invitation.roleId, invitation.organisationId);

      await tx.invitation.update({ where: { id: invitation.id }, data: { status: 'accepted' } });
      const envelope = createEventEnvelope({
        eventType: Subjects.GUEST_CREATED,
        organisationId: invitation.organisationId,
        actorId: userId,
        resourceType: 'organisation-membership',
        resourceId: membership.id,
        payload: { userId, email: invitation.email, organisationId: invitation.organisationId, invitedBy: userId },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.GUEST_CREATED);
      return membership;
    });
  }

  async revokeInvitation(organisationId: string, invitationId: string, actorId: string): Promise<void> {
    await this.assertMemberOf(organisationId, actorId);
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, organisationId, status: 'pending' } });
    if (!invitation) throw new NotFoundException('Pending invitation not found');
    await this.prisma.invitation.update({ where: { id: invitationId }, data: { status: 'revoked' } });
  }

  async listRoles(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.prisma.role.findMany({
      where: { organisationId },
      include: {
        rolePermissions: { include: { permission: true } },
        roleScopes: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async listMembers(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.prisma.organisationMembership.findMany({
      where: { organisationId },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPermissions(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.authorization.listPermissions();
  }

  async createRole(organisationId: string, dto: { name: string; description?: string; permissionIds: string[]; scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }> }, actorId: string): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);
    return this.authorization.createRole(organisationId, dto);
  }

  async updateRole(organisationId: string, roleId: string, dto: { name?: string; description?: string; permissionIds?: string[]; scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }> }, actorId: string): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);
    return this.authorization.updateRole(roleId, organisationId, dto);
  }

  async deleteRole(organisationId: string, roleId: string, actorId: string): Promise<void> {
    await this.assertMemberOf(organisationId, actorId);
    await this.authorization.deleteRole(roleId, organisationId);
  }

  async updateMemberRole(organisationId: string, membershipId: string, roleId: string, actorId: string): Promise<void> {
    await this.assertCanManageMembers(organisationId, actorId);
    await this.authorization.assignMembershipRole(organisationId, membershipId, roleId);
  }

  async listForActor(actorId: string): Promise<unknown[]> {
    return this.prisma.organisation.findMany({
      where: {
        OR: [
          { ownerId: actorId },
          { memberships: { some: { userId: actorId } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveWorkspaceAccess(workspaceId: string, actorId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace || !(await this.canAccess(workspace.organisationId, actorId))) return null;
    return { organisationId: workspace.organisationId };
  }

  async canAccess(organisationId: string, actorId: string): Promise<boolean> {
    const organisation = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!organisation) return false;
    if (organisation.ownerId === actorId) return true;
    return Boolean(await this.prisma.organisationMembership.findUnique({ where: { userId_organisationId: { userId: actorId, organisationId } } }));
  }

  async getUserContext(organisationId: string, actorId: string) {
    return this.authorization.getUserContext(this.prisma, organisationId, actorId);
  }

  private async assertMemberOf(organisationId: string, actorId: string): Promise<void> {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    const membership = await this.prisma.organisationMembership.findUnique({
      where: { userId_organisationId: { userId: actorId, organisationId } },
    });
    if (!membership && org.ownerId !== actorId) {
      throw new ForbiddenException('Not a member of this organisation');
    }
  }

  private async assertCanManageMembers(organisationId: string, actorId: string): Promise<void> {
    const [org, membership] = await Promise.all([
      this.prisma.organisation.findUnique({ where: { id: organisationId } }),
      this.prisma.organisationMembership.findUnique({
        where: { userId_organisationId: { userId: actorId, organisationId } },
        include: { role: true },
      }),
    ]);
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    if (org.ownerId === actorId) {
      return;
    }
    if (!membership) {
      throw new ForbiddenException('Not a member of this organisation');
    }
    const role = membership.role;
    const permissions = (Array.isArray(role.permissions) ? role.permissions : []) as string[];
    if (
      role.name === 'owner' ||
      role.name === 'admin' ||
      permissions.includes('*') ||
      permissions.includes('members.manage')
    ) {
      return;
    }
    throw new ForbiddenException('Not authorized to manage members');
  }
}
