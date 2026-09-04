import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('events')
  async list(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('take') take?: string,
  ) {
    return this.prisma.auditEvent.findMany({
      where: { organisationId: ctx.organisationId },
      orderBy: { storedAt: 'desc' },
      take: Number(take) || 50,
    });
  }
}
