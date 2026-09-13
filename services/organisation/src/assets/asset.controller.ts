import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { OrganisationPermissionGuard, RequirePermissions } from '../organisation/permission.guard.js';
import { AssetService, type AssetInput } from './asset.service.js';

export class AssetDto {
  name?: string;
  category?: string;
  assetTag?: string;
  serialNumber?: string;
  status?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyEnd?: string;
  vendor?: string;
  notes?: string;
}

export class AssignAssetDto {
  userId!: string;
  notes?: string;
}

export class ReturnAssetDto {
  notes?: string;
}

function toInput(dto: AssetDto): AssetInput {
  return {
    ...dto,
    purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
    warrantyEnd: dto.warrantyEnd ? new Date(dto.warrantyEnd) : undefined,
  };
}

@UseGuards(OrganisationPermissionGuard)
@Controller('organisations')
export class AssetController {
  constructor(private readonly assets: AssetService) {}

  @Get(':id/assets')
  @RequirePermissions('admin.asset.view')
  list(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('assigneeUserId') assigneeUserId?: string,
  ) {
    this.assertOrg(id, ctx);
    return this.assets.list(ctx.organisationId, { status, category, search, assigneeUserId });
  }

  @Post(':id/assets')
  @RequirePermissions('admin.asset.create')
  create(
    @Param('id') id: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: AssetDto,
  ) {
    this.assertOrg(id, ctx);
    return this.assets.create(ctx.organisationId, toInput(dto));
  }

  @Get(':id/assets/:assetId')
  @RequirePermissions('admin.asset.view')
  get(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    this.assertOrg(id, ctx);
    return this.assets.getById(ctx.organisationId, assetId);
  }

  @Patch(':id/assets/:assetId')
  @RequirePermissions('admin.asset.edit')
  update(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: AssetDto,
  ) {
    this.assertOrg(id, ctx);
    return this.assets.update(ctx.organisationId, assetId, toInput(dto));
  }

  @Delete(':id/assets/:assetId')
  @RequirePermissions('admin.asset.delete')
  remove(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
  ) {
    this.assertOrg(id, ctx);
    return this.assets.remove(ctx.organisationId, assetId);
  }

  @Post(':id/assets/:assetId/assign')
  @RequirePermissions('admin.asset.assign')
  assign(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: AssignAssetDto,
  ) {
    this.assertOrg(id, ctx);
    return this.assets.assign(ctx.organisationId, ctx.actorId as string, assetId, dto.userId, dto.notes);
  }

  @Post(':id/assets/:assetId/return')
  @RequirePermissions('admin.asset.assign')
  returnAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: ReturnAssetDto,
  ) {
    this.assertOrg(id, ctx);
    return this.assets.returnAsset(ctx.organisationId, assetId, dto.notes);
  }

  private assertOrg(id: string, ctx: OrganisationContextValue): void {
    if (id !== ctx.organisationId) {
      throw new BadRequestException('Organisation context mismatch');
    }
  }
}
