import { BadGatewayException, BadRequestException, Injectable, NotFoundException, ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { Prisma, type Organisation } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AuthorizationService, assertAdminManagedCategory, assertInvitableCategory } from './authorization.service.js';
import { type CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { type CreateMemberDto } from './dto/create-member.dto.js';
import { type InviteMemberDto } from './dto/invite-member.dto.js';
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
    private readonly config: ConfigService,
  ) {}

  private s2sHeaders(actorId?: string, organisationId?: string): Record<string, string> {
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!internalApiKey) {
      throw new Error('INTERNAL_API_KEY is not configured');
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-internal-api-key': internalApiKey,
      'x-internal-caller': 'organisation-service',
    };
    if (actorId) headers['x-actor-id'] = actorId;
    if (organisationId) headers['x-organisation-id'] = organisationId;
    return headers;
  }

  private shouldAutoProvisionEmployee(roleCategory: string) {
    return roleCategory !== 'external' && roleCategory !== 'guest';
  }

  private async fetchAuthUser(actorId: string, userId: string, organisationId: string) {
    const authUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!authUrl) {
      throw new BadGatewayException('Auth service integration is not configured');
    }
    const res = await fetch(`${authUrl}/auth/internal/users/${encodeURIComponent(userId)}`, {
      headers: this.s2sHeaders(actorId, organisationId),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => 'User lookup failed');
      throw new BadGatewayException(`User lookup failed: ${body}`);
    }
    const user = (await res.json()) as { email: string; firstName: string | null; lastName: string | null };
    return {
      email: user.email,
      firstName: user.firstName ?? user.email.split('@')[0] ?? 'Unknown',
      lastName: user.lastName ?? '',
    };
  }

  private emitEmployeeCreate(
    tx: Prisma.TransactionClient,
    roleCategory: string,
    userId: string,
    membershipId: string,
    organisationId: string,
    actorId: string,
    names: { firstName: string; lastName: string; workEmail: string },
  ) {
    if (!this.shouldAutoProvisionEmployee(roleCategory)) return;
    const envelope = createEventEnvelope({
      eventType: Subjects.HRMS_EMPLOYEE_CREATE,
      organisationId,
      actorId,
      resourceType: 'employee',
      resourceId: userId,
      payload: {
        userId,
        membershipId,
        firstName: names.firstName,
        lastName: names.lastName,
        workEmail: names.workEmail,
      },
    });
    return this.outbox.createEvent(tx, envelope, Subjects.HRMS_EMPLOYEE_CREATE);
  }

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
    const ownerUser = await this.fetchAuthUser(ownerId, ownerId, id);

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

      await this.emitEmployeeCreate(
        tx,
        ownerRole.roleCategory ?? 'administrative',
        ownerId,
        membership.id,
        id,
        ownerId,
        { firstName: ownerUser.firstName, lastName: ownerUser.lastName, workEmail: ownerUser.email },
      );

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
    // Employee/candidate access is provisioned through HR/recruitment workflows.
    // Other role categories are also auto-provisioned as employees (except external).
    assertAdminManagedCategory(role.roleCategory);

    const user = this.shouldAutoProvisionEmployee(role.roleCategory)
      ? await this.fetchAuthUser(actorId, dto.userId, organisationId)
      : null;

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

      if (user) {
        await this.emitEmployeeCreate(
          tx,
          role.roleCategory,
          dto.userId,
          created.id,
          organisationId,
          actorId,
          { firstName: user.firstName, lastName: user.lastName, workEmail: user.email },
        );
      }

      return created;
    });

    return membership;
  }

  /**
   * Admin-driven invite: provisions a login account in the auth service
   * (temporary password for new accounts), creates the membership, and emits
   * MEMBER_INVITED so the notification service emails the credentials.
   * Employee/candidate roles are not allowed here — they onboard through the
   * HR and recruitment workflows respectively. All other invited roles
   * (except external) are auto-provisioned as HRMS employees.
   */
  async inviteMember(
    organisationId: string,
    dto: InviteMemberDto,
    actorId: string,
  ): Promise<unknown> {
    await this.assertCanManageMembers(organisationId, actorId);

    const [role, org] = await Promise.all([
      this.prisma.role.findFirst({ where: { id: dto.roleId, organisationId } }),
      this.prisma.organisation.findUnique({ where: { id: organisationId } }),
    ]);
    if (!role) {
      throw new BadRequestException('Role does not belong to this organisation');
    }
    assertInvitableCategory(role.roleCategory);

    const email = dto.email.toLowerCase().trim();

    // Membership uniqueness is on (userId, organisationId); we don't know the
    // userId until the auth service resolves the email, so the conflict check
    // happens after provisioning below.
    const authUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!authUrl) {
      throw new BadGatewayException('Auth service integration is not configured');
    }
    const provisionRes = await fetch(`${authUrl}/auth/internal/provision`, {
      method: 'POST',
      headers: this.s2sHeaders(actorId, organisationId),
      body: JSON.stringify({ email, firstName: dto.firstName, lastName: dto.lastName }),
    });
    if (!provisionRes.ok) {
      const body = await provisionRes.text().catch(() => 'User provisioning failed');
      throw new BadGatewayException(`User provisioning failed: ${body}`);
    }
    const provisioned = (await provisionRes.json()) as {
      user: { id: string; email: string };
      temporaryPassword: string | null;
      accountCreated: boolean;
    };

    const membership = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingMembership = await tx.organisationMembership.findUnique({
        where: { userId_organisationId: { userId: provisioned.user.id, organisationId } },
      });
      if (existingMembership) {
        throw new ConflictException('User is already a member of this organisation');
      }

      const created = await tx.organisationMembership.create({
        data: {
          id: randomUUID(),
          userId: provisioned.user.id,
          organisationId,
          roleId: dto.roleId,
        },
      });

      await this.authorization.applyRoleScopesToMembership(tx, created.id, dto.roleId, organisationId);

      const envelope = createEventEnvelope({
        eventType: Subjects.MEMBER_INVITED,
        organisationId,
        actorId,
        resourceType: 'organisation-membership',
        resourceId: created.id,
        payload: {
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          organisationId,
          organisationName: org?.name,
          roleName: role.name,
          invitedBy: actorId,
          temporaryPassword: provisioned.temporaryPassword ?? undefined,
          accountCreated: provisioned.accountCreated,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEMBER_INVITED);

      // Track the invite so it can be listed, resent, and revoked. The
      // membership already exists — the invitation row only represents the
      // pending account activation.
      await tx.invitation.create({
        data: {
          id: randomUUID(),
          organisationId,
          email,
          roleId: dto.roleId,
          token: randomUUID(),
          userId: provisioned.user.id,
          expiresAt: hoursFromNow(168),
        },
      });

      const firstName = (dto.firstName ?? '').trim() || email.split('@')[0] || 'Unknown';
      const lastName = (dto.lastName ?? '').trim();
      await this.emitEmployeeCreate(
        tx,
        role.roleCategory,
        provisioned.user.id,
        created.id,
        organisationId,
        actorId,
        { firstName, lastName, workEmail: provisioned.user.email },
      );

      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organisationId,
          userId: actorId,
          action: 'member.invited',
          resourceType: 'organisation-membership',
          resourceId: created.id,
          metadata: { email, roleId: dto.roleId, roleName: role.name, accountCreated: provisioned.accountCreated },
        },
      });

      return created;
    });

    return { membership, accountCreated: provisioned.accountCreated };
  }

  /**
   * Auto-provisioning (HRMS → collaboration): when the HRMS service emits
   * `hrms.employee.created` for a user without a membership, create one with
   * the organisation's default (employee) role so they immediately get
   * collaboration access. Runs inside the caller's transaction; emits the
   * standard member-added event so downstream consumers see no difference.
   */
  async provisionMembershipFromEmployee(
    tx: Prisma.TransactionClient,
    organisationId: string,
    userId: string,
  ) {
    const existing = await tx.organisationMembership.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    });
    if (existing) return existing;

    const role = await tx.role.findFirst({
      where: {
        organisationId,
        OR: [{ isDefault: true }, { name: 'employee' }],
      },
      orderBy: [{ isDefault: 'desc' }],
    });
    if (!role) {
      // Organisation predates RBAC seeding; skip rather than fail the event.
      return null;
    }

    const membership = await tx.organisationMembership.create({
      data: {
        id: randomUUID(),
        userId,
        organisationId,
        roleId: role.id,
      },
    });

    await this.authorization.applyRoleScopesToMembership(tx, membership.id, role.id, organisationId);

    const envelope = createEventEnvelope({
      eventType: Subjects.ORGANISATION_MEMBER_ADDED,
      organisationId,
      actorId: 'system',
      resourceType: 'organisation-membership',
      resourceId: membership.id,
      payload: { organisationId, userId, roleId: role.id, source: 'hrms.employee.created' },
    });
    await this.outbox.createEvent(tx, envelope, Subjects.ORGANISATION_MEMBER_ADDED);

    return membership;
  }

  /**
   * HRMS → collaboration offboarding: when the HRMS service emits
   * `hrms.employee.terminated`, remove the user's organisation membership so
   * they lose collaboration access. Memberships carry no status flag —
   * deleting the row cascades its UserRole and DataScope records. Runs inside
   * the caller's transaction. No-op when no membership exists (e.g. the
   * employee was never provisioned into the organisation).
   */
  async deactivateMembershipFromEmployee(
    tx: Prisma.TransactionClient,
    organisationId: string,
    userId: string,
  ) {
    const membership = await tx.organisationMembership.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    });
    if (!membership) return null;

    await tx.organisationMembership.delete({ where: { id: membership.id } });
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
    // Invitations are the member/guest/external onboarding workflows, so those
    // categories are allowed here; employee and candidate categories are not.
    assertInvitableCategory(role.roleCategory);

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
    await this.assertCanManageMembers(organisationId, actorId);
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, organisationId, status: 'pending' } });
    if (!invitation) throw new NotFoundException('Pending invitation not found');
    await this.prisma.invitation.update({ where: { id: invitationId }, data: { status: 'revoked' } });

    // Account-based invites (created via members/invite) also carry a
    // provisioned membership + unactivated auth account — remove both so the
    // invitee loses access and the email can be invited again.
    if (invitation.userId) {
      await this.prisma.organisationMembership.deleteMany({
        where: { userId: invitation.userId, organisationId },
      });
      await this.deleteUnactivatedAuthUser(invitation.userId, actorId, organisationId);
      await this.prisma.auditLog.create({
        data: {
          id: randomUUID(),
          organisationId,
          userId: actorId,
          action: 'member.invitation_revoked',
          resourceType: 'invitation',
          resourceId: invitation.id,
          metadata: { email: invitation.email, userId: invitation.userId },
        },
      });
    }
  }

  /**
   * Resend an invitation: a fresh temporary password is generated in the auth
   * service and the credentials email is re-sent via MEMBER_INVITED. Legacy
   * token invites (no linked userId) are upgraded — the account is provisioned
   * and the membership created, so resend always produces the login +
   * temporary password email. Only client portal invites keep the token link.
   */
  async resendInvitation(organisationId: string, invitationId: string, actorId: string): Promise<void> {
    await this.assertCanManageMembers(organisationId, actorId);
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, organisationId } });
    if (!invitation || invitation.status !== 'pending') throw new NotFoundException('Pending invitation not found');

    const expiresAt = hoursFromNow(168);
    const [org, role] = await Promise.all([
      this.prisma.organisation.findUnique({ where: { id: organisationId } }),
      this.prisma.role.findUnique({ where: { id: invitation.roleId } }),
    ]);

    const authUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!authUrl) {
      throw new BadGatewayException('Auth service integration is not configured');
    }

    let email = invitation.email;
    let firstName: string | undefined;
    let lastName: string | undefined;
    let temporaryPassword: string | undefined;
    let accountCreated = false;
    let userId = invitation.userId;

    if (userId) {
      const resetRes = await fetch(
        `${authUrl}/auth/internal/users/${encodeURIComponent(userId)}/reset-temporary-password`,
        { method: 'POST', headers: this.s2sHeaders(actorId, organisationId) },
      );
      if (!resetRes.ok) {
        const body = await resetRes.text().catch(() => 'Password reset failed');
        throw new BadGatewayException(`Password reset failed: ${body}`);
      }
      const reset = (await resetRes.json()) as {
        user: { email: string; firstName: string | null; lastName: string | null };
        temporaryPassword: string;
      };
      email = reset.user.email;
      firstName = reset.user.firstName ?? undefined;
      lastName = reset.user.lastName ?? undefined;
      temporaryPassword = reset.temporaryPassword;
    } else {
      // Legacy token invite: upgrade to an account-based invite by provisioning
      // the user up-front, exactly like inviteMember does.
      const provisionRes = await fetch(`${authUrl}/auth/internal/provision`, {
        method: 'POST',
        headers: this.s2sHeaders(actorId, organisationId),
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      if (!provisionRes.ok) {
        const body = await provisionRes.text().catch(() => 'User provisioning failed');
        throw new BadGatewayException(`User provisioning failed: ${body}`);
      }
      const provisioned = (await provisionRes.json()) as {
        user: { id: string; email: string; firstName: string | null; lastName: string | null };
        temporaryPassword: string | null;
        accountCreated: boolean;
      };
      userId = provisioned.user.id;
      email = provisioned.user.email;
      firstName = provisioned.user.firstName ?? undefined;
      lastName = provisioned.user.lastName ?? undefined;
      temporaryPassword = provisioned.temporaryPassword ?? undefined;
      accountCreated = provisioned.accountCreated;

      if (!temporaryPassword) {
        // Account exists but is still unactivated — rotate its temp password.
        const resetRes = await fetch(
          `${authUrl}/auth/internal/users/${encodeURIComponent(userId)}/reset-temporary-password`,
          { method: 'POST', headers: this.s2sHeaders(actorId, organisationId) },
        );
        if (resetRes.ok) {
          temporaryPassword = ((await resetRes.json()) as { temporaryPassword: string }).temporaryPassword;
        } else if (resetRes.status === 404) {
          throw new BadGatewayException('Invited account no longer exists');
        }
        // 409 → account already activated; the email falls back to the
        // "sign in with your existing account" wording.
      }
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (!invitation.userId && userId) {
        const existingMembership = await tx.organisationMembership.findUnique({
          where: { userId_organisationId: { userId, organisationId } },
        });
        if (!existingMembership) {
          const created = await tx.organisationMembership.create({
            data: { id: randomUUID(), userId, organisationId, roleId: invitation.roleId },
          });
          await this.authorization.applyRoleScopesToMembership(tx, created.id, invitation.roleId, organisationId);
          const fallbackFirst = email.split('@')[0] || 'Unknown';
          await this.emitEmployeeCreate(
            tx,
            role?.roleCategory ?? 'member',
            userId,
            created.id,
            organisationId,
            actorId,
            { firstName: firstName ?? fallbackFirst, lastName: lastName ?? '', workEmail: email },
          );
        }
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { userId, expiresAt },
      });

      const envelope = createEventEnvelope({
        eventType: Subjects.MEMBER_INVITED,
        organisationId,
        actorId,
        resourceType: 'invitation',
        resourceId: invitation.id,
        payload: {
          email,
          firstName,
          lastName,
          organisationId,
          organisationName: org?.name,
          roleName: role?.name,
          invitedBy: actorId,
          temporaryPassword,
          accountCreated,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEMBER_INVITED);
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organisationId,
          userId: actorId,
          action: 'member.invitation_resent',
          resourceType: 'invitation',
          resourceId: invitation.id,
          metadata: { email },
        },
      });
    });
  }

  /**
   * Remove a member from the organisation. If the account is still an
   * unactivated invited account it is deleted in the auth service as well.
   */
  async removeMember(organisationId: string, membershipId: string, actorId: string): Promise<void> {
    await this.assertCanManageMembers(organisationId, actorId);
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { id: membershipId, organisationId },
      include: { role: true },
    });
    if (!membership) throw new NotFoundException('Member not found');

    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (org?.ownerId === membership.userId) {
      throw new BadRequestException('The organisation owner cannot be removed');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.organisationMembership.delete({ where: { id: membership.id } });
      await tx.invitation.updateMany({
        where: { userId: membership.userId, organisationId, status: 'pending' },
        data: { status: 'revoked' },
      });
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organisationId,
          userId: actorId,
          action: 'member.removed',
          resourceType: 'organisation-membership',
          resourceId: membership.id,
          metadata: { userId: membership.userId, roleId: membership.roleId },
        },
      });
    });

    // Only pending single-org invited accounts are cleaned up; the auth
    // service refuses to delete activated accounts anyway.
    const remaining = await this.prisma.organisationMembership.count({ where: { userId: membership.userId } });
    if (remaining === 0) {
      await this.deleteUnactivatedAuthUser(membership.userId, actorId, organisationId);
    }
  }

  /**
   * Called by the user-activation consumer when an invited account completes
   * its first password change — marks the pending invitation as accepted.
   */
  async markInvitationAccepted(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.invitation.updateMany({
      where: { userId, status: 'pending' },
      data: { status: 'accepted' },
    });
  }

  /**
   * Best-effort delete of an auth account that is still unactivated. Activated
   * accounts are kept — the auth service returns 409 which is ignored here.
   */
  private async deleteUnactivatedAuthUser(userId: string, actorId: string, organisationId: string): Promise<void> {
    const authUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!authUrl) return;
    try {
      await fetch(`${authUrl}/auth/internal/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: this.s2sHeaders(actorId, organisationId),
      });
    } catch {
      // best effort — membership is already removed
    }
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

  async countMembers(organisationId: string, actorId: string): Promise<{ count: number }> {
    await this.assertMemberOf(organisationId, actorId);
    const count = await this.prisma.organisationMembership.count({ where: { organisationId } });
    return { count };
  }

  async findMembership(organisationId: string, actorId: string, userId: string): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { organisationId, userId },
      include: { role: true },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    return membership;
  }

  async listPermissions(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.authorization.listPermissions();
  }

  async createRole(organisationId: string, dto: { name: string; description?: string; roleCategory: string; permissionIds: string[]; scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }> }, actorId: string): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);
    return this.authorization.createRole(organisationId, dto, actorId);
  }

  async updateRole(organisationId: string, roleId: string, dto: { name?: string; description?: string; roleCategory?: string; permissionIds?: string[]; scopes?: Array<{ module: string; scope: string; scopeValue?: string | null }> }, actorId: string): Promise<unknown> {
    await this.assertMemberOf(organisationId, actorId);
    return this.authorization.updateRole(roleId, organisationId, dto, actorId);
  }

  async deleteRole(organisationId: string, roleId: string, actorId: string): Promise<void> {
    await this.assertMemberOf(organisationId, actorId);
    await this.authorization.deleteRole(roleId, organisationId, actorId);
  }

  async updateMemberRole(organisationId: string, membershipId: string, roleId: string, actorId: string): Promise<void> {
    await this.assertCanManageMembers(organisationId, actorId);
    await this.authorization.assignMembershipRole(organisationId, membershipId, roleId, actorId);
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
