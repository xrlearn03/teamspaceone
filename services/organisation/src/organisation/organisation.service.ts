import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@reactify/event-contracts';
import { Prisma, type Organisation } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { type CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { type CreateMemberDto } from './dto/create-member.dto.js';
import { type CreateInvitationDto } from './dto/create-invitation.dto.js';
import { type CreateWorkspaceDto } from './dto/create-workspace.dto.js';

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

@Injectable()
export class OrganisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
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

      const ownerRole = await tx.role.create({
        data: {
          id: randomUUID(),
          organisationId: id,
          name: 'owner',
          permissions: ['*'],
          isDefault: false,
        },
      });

      await tx.role.create({
        data: {
          id: randomUUID(),
          organisationId: id,
          name: 'member',
          permissions: [],
          isDefault: true,
        },
      });

      const membership = await tx.organisationMembership.create({
        data: {
          id: randomUUID(),
          userId: ownerId,
          organisationId: id,
          roleId: ownerRole.id,
        },
      });

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
    await this.assertMemberOf(organisationId, actorId);

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
    await this.assertMemberOf(organisationId, actorId);

    return this.prisma.invitation.create({
      data: {
        id: randomUUID(),
        organisationId,
        email: dto.email.toLowerCase(),
        roleId: dto.roleId,
        token: randomUUID(),
        expiresAt: hoursFromNow(168),
      },
    });
  }

  async listWorkspaces(organisationId: string, actorId: string): Promise<unknown[]> {
    await this.assertMemberOf(organisationId, actorId);
    return this.prisma.workspace.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
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
}
