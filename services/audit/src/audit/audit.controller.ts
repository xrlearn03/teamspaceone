import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { ADMIN_PERMISSIONS } from '@teamspace-one/authorization';
import { PrismaService } from '../prisma/prisma.service.js';

@UseGuards(RemotePermissionGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('events')
  @RequirePermissions(ADMIN_PERMISSIONS.AUDIT_VIEW)
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
