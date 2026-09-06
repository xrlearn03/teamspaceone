import { createHash, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { OrganisationService } from './organisation.service.js';
import { CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { CreateMemberDto } from './dto/create-member.dto.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Controller('organisations')
export class OrganisationController {
  constructor(
    private readonly organisation: OrganisationService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async listForActor(
    @Headers('x-actor-id') actorId?: string,
  ) {
    if (!actorId) {
      throw new Error('Missing x-actor-id header');
    }
    return this.organisation.listForActor(actorId);
  }

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

  @Get('workspaces/:workspaceId/access')
  resolveWorkspaceAccess(@Param('workspaceId') workspaceId: string, @Headers('x-actor-id') actorId?: string) {
    if (!actorId) return null;
    return this.organisation.resolveWorkspaceAccess(workspaceId, actorId);
  }

  @Get(':id/access')
  async canAccess(@Param('id') id: string, @Headers('x-actor-id') actorId?: string) {
    return { allowed: actorId ? await this.organisation.canAccess(id, actorId) : false };
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

  @Get(':id/clients')
  listClients(@Param('id') id: string, @CurrentOrganisation() ctx: OrganisationContextValue) {
    this.assertOrg(id, ctx);
    return this.organisation.listClients(ctx.organisationId, ctx.actorId as string);
  }

  @Post(':id/clients')
  createClient(@Param('id') id: string, @CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateClientDto) {
    this.assertOrg(id, ctx);
    return this.organisation.createClient(ctx.organisationId, ctx.actorId as string, dto);
  }

  @Patch(':id/clients/:clientId')
  updateClient(@Param('id') id: string, @Param('clientId') clientId: string, @CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: UpdateClientDto) {
    this.assertOrg(id, ctx);
    return this.organisation.updateClient(ctx.organisationId, clientId, ctx.actorId as string, dto);
  }

  @Delete(':id/clients/:clientId')
  async deleteClient(@Param('id') id: string, @Param('clientId') clientId: string, @CurrentOrganisation() ctx: OrganisationContextValue) {
    this.assertOrg(id, ctx);
    await this.organisation.deleteClient(ctx.organisationId, clientId, ctx.actorId as string);
  }

  @Post('invitations/accept')
  acceptInvitation(
    @Body() dto: { token: string },
    @Headers('x-actor-id') actorId?: string,
  ) {
    if (!actorId) throw new Error('Missing x-actor-id header');
    return this.organisation.acceptInvitation(dto.token, actorId);
  }

  @Get('invitations/:token')
  async getPublicInvitation(@Param('token') token: string) {
    const invitation = await this.organisation.getInvitationByToken(token);
    if (!invitation) throw new BadRequestException('Invitation not found');
    const { email, organisationId, clientId, roleId, status, expiresAt } = invitation;
    return { email, organisationId, clientId: clientId ?? undefined, roleId, status, expiresAt: expiresAt.toISOString() };
  }

  @Post('invitations/:token/accept')
  async acceptPublicInvitation(
    @Param('token') token: string,
    @Body() dto: { userId: string },
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
  ) {
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    if (!expected) {
      throw new UnauthorizedException('Service authentication is not configured');
    }
    if (!internalApiKey || !internalCaller) {
      throw new UnauthorizedException('Unauthorized');
    }
    const a = createHash('sha256').update(internalApiKey).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b)) {
      throw new ForbiddenException('Forbidden');
    }
    return this.organisation.acceptInvitation(token, dto.userId);
  }

  @Get(':id/invitations')
  listInvitations(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    this.assertOrg(id, ctx);
    return this.organisation.listInvitations(ctx.organisationId, ctx.actorId as string);
  }

  @Delete(':id/invitations/:invitationId')
  async revokeInvitation(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    this.assertOrg(id, ctx);
    await this.organisation.revokeInvitation(ctx.organisationId, invitationId, ctx.actorId as string);
  }

  @Get(':id/roles')
  async listRoles(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    this.assertOrg(id, ctx);
    return this.organisation.listRoles(ctx.organisationId, ctx.actorId as string);
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
