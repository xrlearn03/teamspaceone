import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { COLLABORATION_PERMISSIONS } from '@teamspace-one/authorization';
import { OrganisationPermissionGuard, RequirePermissions } from '../organisation/permission.guard.js';
import { TicketService } from './ticket.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';

@UseGuards(OrganisationPermissionGuard)
@Controller('organisations')
export class TicketController {
  constructor(private readonly tickets: TicketService) {}

  @Post(':id/tickets')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TICKET_CREATE)
  create(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateTicketDto,
  ) {
    this.assertOrg(id, ctx);
    return this.tickets.create(ctx.organisationId, ctx.actorId as string, dto);
  }

  @Get(':id/tickets')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TICKET_VIEW)
  list(@Param('id') id: string, @CurrentOrganisation() ctx: OrganisationContextValue) {
    this.assertOrg(id, ctx);
    return this.tickets.list(ctx.organisationId, ctx.actorId as string);
  }

  @Patch(':id/tickets/:ticketId')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TICKET_MANAGE)
  updateStatus(
    @Param('id') id: string,
    @Param('ticketId') ticketId: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    this.assertOrg(id, ctx);
    return this.tickets.updateStatus(ctx.organisationId, ctx.actorId as string, ticketId, dto.status);
  }

  private assertOrg(id: string, ctx: OrganisationContextValue): void {
    if (id !== ctx.organisationId) {
      throw new Error('Organisation context mismatch');
    }
  }
}
