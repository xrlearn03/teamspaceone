import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import { createEventEnvelope } from '@teamspace-one/event-contracts';
import type { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { HrmsScopeService } from './scope.service.js';
import type { RequestContextInput } from './employees.service.js';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scope: HrmsScopeService,
  ) {}

  async list(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    employeeId?: string,
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);

    const scopedEmployees = await this.prisma.employee.findMany({
      where: { organisationId: ctx.organisationId, AND: [resolved.employeeWhere] },
      select: { id: true },
    });
    let employeeIds = scopedEmployees.map((e) => e.id);

    if (employeeId) {
      if (!employeeIds.includes(employeeId)) {
        throw new ForbiddenException('Employee is outside your data scope');
      }
      employeeIds = [employeeId];
    }

    return this.prisma.employeeDocument.findMany({
      where: {
        organisationId: ctx.organisationId,
        employeeId: { in: employeeIds },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    ctx: RequestContextInput,
    user: AuthorizableUser,
    input: { employeeId: string; fileId: string; category: string; name?: string },
  ) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const target = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, organisationId: ctx.organisationId },
    });
    if (!target) throw new NotFoundException('Employee not found');

    // Employees may upload documents to their own record; otherwise the
    // target must be inside the caller's data scope.
    const isSelf = resolved.actorEmployee?.id === target.id;
    if (!isSelf && !this.scope.canSeeEmployee(resolved, target)) {
      throw new ForbiddenException('Employee is outside your data scope');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const document = await tx.employeeDocument.create({
        data: {
          organisationId: ctx.organisationId,
          employeeId: target.id,
          fileId: input.fileId,
          category: input.category,
          name: input.name,
          uploadedBy: ctx.actorId,
        },
      });

      const envelope = createEventEnvelope({
        eventType: 'teamspace-one.hrms.document.uploaded',
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        correlationId: ctx.correlationId,
        resourceType: 'employee-document',
        resourceId: document.id,
        payload: { employeeId: target.id, category: input.category, fileId: input.fileId },
      });
      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return document;
    });
  }

  async remove(ctx: RequestContextInput, user: AuthorizableUser, id: string) {
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (!can(user, 'hrms.document.delete') && document.uploadedBy !== ctx.actorId) {
      throw new ForbiddenException('Only the uploader or an HR admin can delete documents');
    }

    return this.prisma.employeeDocument.delete({ where: { id } });
  }
}
