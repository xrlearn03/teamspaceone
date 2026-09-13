import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export const ASSET_STATUSES = ['available', 'assigned', 'maintenance', 'retired'] as const;

export interface AssetInput {
  name?: string;
  category?: string;
  assetTag?: string;
  serialNumber?: string;
  status?: string;
  purchaseDate?: Date;
  purchaseCost?: number;
  warrantyEnd?: Date;
  vendor?: string;
  notes?: string;
}

export interface AssetListParams {
  status?: string;
  category?: string;
  search?: string;
  assigneeUserId?: string;
}

const activeAssignment = {
  assignments: {
    where: { returnedAt: null },
    orderBy: { assignedAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.AssetInclude;

@Injectable()
export class AssetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organisationId: string, params: AssetListParams) {
    const where: Prisma.AssetWhereInput = { organisationId };
    if (params.status) where.status = params.status;
    if (params.category) where.category = params.category;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { assetTag: { contains: params.search, mode: 'insensitive' } },
        { serialNumber: { contains: params.search, mode: 'insensitive' } },
        { vendor: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.assigneeUserId) {
      where.assignments = {
        some: { assigneeUserId: params.assigneeUserId, returnedAt: null },
      };
    }
    const assets = await this.prisma.asset.findMany({
      where,
      include: activeAssignment,
      orderBy: { createdAt: 'desc' },
    });
    return assets.map((a) => this.withCurrentAssignment(a));
  }

  async getById(organisationId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organisationId },
      include: { assignments: { orderBy: { assignedAt: 'desc' } } },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    const { assignments, ...rest } = asset;
    return {
      ...rest,
      assignments,
      currentAssignment: assignments.find((a) => a.returnedAt === null) ?? null,
    };
  }

  create(organisationId: string, input: AssetInput) {
    this.assertStatus(input.status);
    if (input.status === 'assigned') {
      throw new BadRequestException('New assets cannot start as assigned — use the assign flow');
    }
    return this.prisma.asset.create({
      data: {
        organisationId,
        name: input.name!,
        category: input.category,
        assetTag: input.assetTag,
        serialNumber: input.serialNumber,
        status: input.status ?? 'available',
        purchaseDate: input.purchaseDate,
        purchaseCost: input.purchaseCost,
        warrantyEnd: input.warrantyEnd,
        vendor: input.vendor,
        notes: input.notes,
      },
    });
  }

  async update(organisationId: string, id: string, input: AssetInput) {
    const asset = await this.getById(organisationId, id);
    this.assertStatus(input.status);
    if (input.status !== undefined && input.status !== 'assigned' && asset.currentAssignment) {
      throw new BadRequestException(
        'Asset has an active assignment — return it before changing status',
      );
    }
    if (input.status === 'assigned' && !asset.currentAssignment) {
      throw new BadRequestException('Assign the asset to a member instead of setting status directly');
    }
    const data: Prisma.AssetUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.category !== undefined) data.category = input.category;
    if (input.assetTag !== undefined) data.assetTag = input.assetTag;
    if (input.serialNumber !== undefined) data.serialNumber = input.serialNumber;
    if (input.status !== undefined) data.status = input.status;
    if (input.purchaseDate !== undefined) data.purchaseDate = input.purchaseDate;
    if (input.purchaseCost !== undefined) data.purchaseCost = input.purchaseCost;
    if (input.warrantyEnd !== undefined) data.warrantyEnd = input.warrantyEnd;
    if (input.vendor !== undefined) data.vendor = input.vendor;
    if (input.notes !== undefined) data.notes = input.notes;
    return this.prisma.asset.update({ where: { id }, data });
  }

  async remove(organisationId: string, id: string) {
    const asset = await this.getById(organisationId, id);
    if (asset.currentAssignment) {
      throw new BadRequestException('Return the asset before deleting it');
    }
    return this.prisma.asset.delete({ where: { id } });
  }

  async assign(organisationId: string, actorId: string, id: string, userId: string, notes?: string) {
    const asset = await this.getById(organisationId, id);
    if (asset.status === 'retired') {
      throw new BadRequestException('Retired assets cannot be assigned');
    }
    if (asset.status === 'maintenance') {
      throw new BadRequestException('Asset is under maintenance');
    }
    if (asset.currentAssignment) {
      throw new BadRequestException('Asset is already assigned — return it first');
    }
    if (!userId?.trim()) {
      throw new BadRequestException('Assignee is required');
    }
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { organisationId, userId },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException('Assignee is not a member of this organisation');
    }
    const [assignment] = await this.prisma.$transaction([
      this.prisma.assetAssignment.create({
        data: {
          organisationId,
          assetId: id,
          assigneeUserId: userId,
          assignedBy: actorId || null,
          notes,
        },
      }),
      this.prisma.asset.update({
        where: { id },
        data: { status: 'assigned' },
      }),
    ]);
    return assignment;
  }

  async returnAsset(organisationId: string, id: string, notes?: string) {
    const asset = await this.getById(organisationId, id);
    const current = asset.currentAssignment;
    if (!current) {
      throw new BadRequestException('Asset is not currently assigned');
    }
    const [assignment] = await this.prisma.$transaction([
      this.prisma.assetAssignment.update({
        where: { id: current.id },
        data: { returnedAt: new Date(), notes: notes ?? current.notes },
      }),
      this.prisma.asset.update({
        where: { id },
        data: { status: 'available' },
      }),
    ]);
    return assignment;
  }

  private withCurrentAssignment<
    T extends { assignments: Array<{ returnedAt: Date | null }> },
  >(asset: T) {
    const { assignments, ...rest } = asset;
    return { ...rest, currentAssignment: assignments[0] ?? null };
  }

  private assertStatus(status?: string) {
    if (status !== undefined && !ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number])) {
      throw new BadRequestException(
        `Invalid asset status "${status}" — expected one of ${ASSET_STATUSES.join(', ')}`,
      );
    }
  }
}
