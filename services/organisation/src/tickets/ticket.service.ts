import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { Prisma, type OrganisationMembership, type UserRole } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { CreateTicketDto, TICKET_PRIORITIES, type TicketAttachmentInput } from './dto/create-ticket.dto.js';
import { TICKET_STATUSES } from './dto/update-ticket-status.dto.js';

/** Only these system roles can be assigned internal support tickets. */
export const TICKET_ASSIGNEE_ROLE_NAMES = ['owner', 'org_admin', 'hr_admin', 'hr_manager'];

type MembershipWithRoles = (OrganisationMembership & { userRoles: UserRole[] }) | null;

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(organisationId: string, actorId: string, dto: CreateTicketDto) {
    await this.assertMember(organisationId, actorId);

    const subject = dto.subject?.trim();
    const description = dto.description?.trim();
    const category = dto.category?.trim();
    if (!subject || subject.length > 200) {
      throw new BadRequestException('Subject must be between 1 and 200 characters');
    }
    if (!description) {
      throw new BadRequestException('Description is required');
    }
    if (!category) {
      throw new BadRequestException('Category is required');
    }
    if (!TICKET_PRIORITIES.includes(dto.priority as (typeof TICKET_PRIORITIES)[number])) {
      throw new BadRequestException('Invalid priority');
    }

    const role = await this.prisma.role.findFirst({
      where: { id: dto.assigneeRoleId, organisationId },
    });
    if (!role) {
      throw new BadRequestException('Assignee role not found in this organisation');
    }
    if (!TICKET_ASSIGNEE_ROLE_NAMES.includes(role.name)) {
      throw new BadRequestException(
        'Tickets can only be assigned to the HR Admin, HR Manager, or Admin roles',
      );
    }

    const attachments = this.sanitizeAttachments(dto.attachments);
    const recipientIds = await this.userIdsForRole(organisationId, role.id);
    const id = randomUUID();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ticket = await tx.ticket.create({
        data: {
          id,
          organisationId,
          subject,
          description,
          category,
          priority: dto.priority,
          status: 'new',
          requesterId: actorId,
          assigneeRoleId: role.id,
          attachments: attachments as unknown as Prisma.InputJsonValue,
        },
        include: { assigneeRole: { select: { id: true, name: true, description: true } } },
      });
      const envelope = createEventEnvelope({
        eventType: Subjects.TICKET_CREATED,
        organisationId,
        actorId,
        resourceType: 'ticket',
        resourceId: id,
        payload: {
          id,
          subject,
          category,
          priority: dto.priority,
          requesterId: actorId,
          assigneeRoleId: role.id,
          assigneeRoleName: role.description || role.name,
          recipientIds,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.TICKET_CREATED);
      return ticket;
    });
  }

  async list(organisationId: string, actorId: string) {
    const { isOwner, membership } = await this.assertMember(organisationId, actorId);
    const roleIds = this.memberRoleIds(membership);
    const where: Prisma.TicketWhereInput = isOwner
      ? { organisationId }
      : {
          organisationId,
          OR: [{ requesterId: actorId }, { assigneeRoleId: { in: roleIds } }],
        };
    return this.prisma.ticket.findMany({
      where,
      include: { assigneeRole: { select: { id: true, name: true, description: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(organisationId: string, actorId: string, ticketId: string, status: string) {
    const { isOwner, membership } = await this.assertMember(organisationId, actorId);
    if (!TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
      throw new BadRequestException('Invalid status');
    }
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organisationId },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    if (!isOwner && !this.memberRoleIds(membership).includes(ticket.assigneeRoleId)) {
      throw new ForbiddenException('Only members of the assignee role can update this ticket');
    }
    if (ticket.status === status) return ticket;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { status },
        include: { assigneeRole: { select: { id: true, name: true, description: true } } },
      });
      const envelope = createEventEnvelope({
        eventType: Subjects.TICKET_STATUS_CHANGED,
        organisationId,
        actorId,
        resourceType: 'ticket',
        resourceId: ticket.id,
        payload: {
          id: ticket.id,
          subject: ticket.subject,
          status,
          requesterId: ticket.requesterId,
          recipientIds: [ticket.requesterId],
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.TICKET_STATUS_CHANGED);
      return updated;
    });
  }

  private async assertMember(
    organisationId: string,
    actorId: string,
  ): Promise<{ isOwner: boolean; membership: MembershipWithRoles }> {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    const membership = await this.prisma.organisationMembership.findUnique({
      where: { userId_organisationId: { userId: actorId, organisationId } },
      include: { userRoles: true },
    });
    const isOwner = org.ownerId === actorId;
    if (!membership && !isOwner) {
      throw new ForbiddenException('Not a member of this organisation');
    }
    return { isOwner, membership };
  }

  private memberRoleIds(membership: MembershipWithRoles): string[] {
    if (!membership) return [];
    return [membership.roleId, ...(membership.userRoles ?? []).map((ur) => ur.roleId)];
  }

  private async userIdsForRole(organisationId: string, roleId: string): Promise<string[]> {
    const [memberships, extraRoles] = await Promise.all([
      this.prisma.organisationMembership.findMany({
        where: { organisationId, roleId },
        select: { userId: true },
      }),
      this.prisma.userRole.findMany({
        where: { roleId, membership: { organisationId } },
        select: { membership: { select: { userId: true } } },
      }),
    ]);
    return [
      ...new Set([
        ...memberships.map((m) => m.userId),
        ...extraRoles.map((ur) => ur.membership.userId),
      ]),
    ];
  }

  private sanitizeAttachments(input?: TicketAttachmentInput[]): TicketAttachmentInput[] {
    if (!Array.isArray(input)) return [];
    return input
      .filter(
        (a): a is TicketAttachmentInput =>
          Boolean(a) &&
          typeof a.fileId === 'string' &&
          typeof a.name === 'string' &&
          typeof a.size === 'number' &&
          typeof a.mimeType === 'string',
      )
      .slice(0, 10)
      .map((a) => ({
        fileId: a.fileId,
        name: a.name.slice(0, 255),
        size: Math.max(0, Math.floor(a.size)),
        mimeType: a.mimeType.slice(0, 100),
      }));
  }
}
