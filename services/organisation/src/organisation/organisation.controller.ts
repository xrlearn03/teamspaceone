import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { OrganisationContext, CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { OrganisationService } from './organisation.service.js';
import { type CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { type CreateMemberDto } from './dto/create-member.dto.js';
import { type CreateInvitationDto } from './dto/create-invitation.dto.js';
import { type CreateWorkspaceDto } from './dto/create-workspace.dto.js';

@Controller('organisations')
export class OrganisationController {
  constructor(private readonly organisation: OrganisationService) {}

  @Post()
  async create(
    @Body() dto: CreateOrganisationDto,
    @Headers('x-actor-id') actorId?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    if (!actorId) {
      throw new Error('Missing x-actor-id header');
    }
    return this.organisation.create(dto, actorId, correlationId);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateMemberDto,
  ) {
    this.assertOrg(id, ctx);
    return this.organisation.addMember(ctx.organisationId, dto, ctx.actorId as string);
  }

  @Post(':id/workspaces')
  async createWorkspace(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateWorkspaceDto,
  ) {
    this.assertOrg(id, ctx);
    return this.organisation.createWorkspace(ctx.organisationId, dto, ctx.actorId as string);
  }

  @Post(':id/invitations')
  async createInvitation(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateInvitationDto,
  ) {
    this.assertOrg(id, ctx);
    return this.organisation.createInvitation(ctx.organisationId, dto, ctx.actorId as string);
  }

  @Get(':id/workspaces')
  async listWorkspaces(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    this.assertOrg(id, ctx);
    return this.organisation.listWorkspaces(ctx.organisationId, ctx.actorId as string);
  }

  @Get(':id/members')
  async listMembers(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    this.assertOrg(id, ctx);
    return this.organisation.listMembers(ctx.organisationId, ctx.actorId as string);
  }

  private assertOrg(id: string, ctx: OrganisationContextValue): void {
    if (id !== ctx.organisationId) {
      throw new Error('Organisation context mismatch');
    }
  }
}
