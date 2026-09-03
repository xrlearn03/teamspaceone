import { Controller, Get, Patch, Param } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.prisma.notification.findMany({
      where: { organisationId: ctx.organisationId, userId: ctx.actorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':id/read')
  async markRead(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.prisma.notification.update({
      where: { id, userId: ctx.actorId },
      data: { read: true },
    });
  }
}
