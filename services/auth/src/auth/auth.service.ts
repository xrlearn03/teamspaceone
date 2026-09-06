import { BadRequestException, Injectable, UnauthorizedException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { Prisma, type User } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { TokenService, type TokenPair } from './token.service.js';
import { type RegisterDto } from './dto/register.dto.js';
import { type LoginDto } from './dto/login.dto.js';
import { type RedeemInvitationDto } from './dto/redeem-invitation.dto.js';
import { type UserDto } from './dto/user.dto.js';
import { type UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto, correlationId?: string): Promise<{ user: UserDto; tokens: TokenPair }> {
    if (!input?.email || !input?.password) {
      throw new BadRequestException('Email and password are required');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await hash(input.password, 12);
    const id = randomUUID();

    const envelope = createEventEnvelope({
      eventType: Subjects.USER_CREATED,
      organisationId: 'global',
      actorId: id,
      resourceType: 'user',
      resourceId: id,
      correlationId,
      payload: {
        id,
        email: input.email.toLowerCase(),
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      },
    });

    const user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.user.create({
        data: {
          id,
          email: input.email.toLowerCase(),
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });

      await this.outbox.createEvent(tx, envelope, Subjects.USER_CREATED);

      return created;
    });

    const tokens = await this.tokens.issuePair(user);
    return { user: this.toDto(user), tokens };
  }

  async redeemInvitation(input: RedeemInvitationDto, correlationId?: string): Promise<{ user: UserDto; tokens: TokenPair }> {
    if (!input?.email || !input?.password || !input?.token) {
      throw new BadRequestException('Token, email and password are required');
    }

    const organisationUrl = this.config.get<string>('ORGANISATION_SERVICE_URL');
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!organisationUrl || !internalApiKey) {
      throw new BadRequestException('Organisation integration not configured');
    }

    const lookupRes = await fetch(`${organisationUrl}/organisations/invitations/${encodeURIComponent(input.token)}`);
    if (!lookupRes.ok) {
      throw new NotFoundException('Invitation not found');
    }
    const invitation = (await lookupRes.json()) as { email: string; status: string; expiresAt: string };
    if (invitation.email.toLowerCase() !== input.email.toLowerCase().trim()) {
      throw new ForbiddenException('Email does not match invitation');
    }
    if (invitation.status !== 'pending') {
      throw new BadRequestException('Invitation is no longer pending');
    }
    if (new Date(invitation.expiresAt) <= new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    let user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });

    if (user) {
      const valid = await compare(input.password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      const passwordHash = await hash(input.password, 12);
      const id = randomUUID();
      const email = input.email.toLowerCase().trim();

      const envelope = createEventEnvelope({
        eventType: Subjects.USER_CREATED,
        organisationId: 'global',
        actorId: id,
        resourceType: 'user',
        resourceId: id,
        correlationId,
        payload: {
          id,
          email,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
        },
      });

      user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.user.create({
          data: {
            id,
            email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });
        await this.outbox.createEvent(tx, envelope, Subjects.USER_CREATED);
        return created;
      });
    }

    const acceptRes = await fetch(`${organisationUrl}/organisations/invitations/${encodeURIComponent(input.token)}/accept`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': internalApiKey,
      },
      body: JSON.stringify({ userId: user.id }),
    });

    if (!acceptRes.ok) {
      const body = await acceptRes.text().catch(() => 'Invitation acceptance failed');
      throw new BadRequestException(body);
    }

    const tokens = await this.tokens.issuePair(user);
    return { user: this.toDto(user), tokens };
  }

  async login(input: LoginDto): Promise<{ user: UserDto; tokens: TokenPair }> {
    if (!input?.email || !input?.password) {
      throw new BadRequestException('Email and password are required');
    }
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.tokens.issuePair(user);
    return { user: this.toDto(user), tokens };
  }

  async refresh(rawRefresh: string): Promise<TokenPair> {
    return this.tokens.rotate(rawRefresh);
  }

  async logout(rawRefresh: string): Promise<void> {
    await this.tokens.revoke(rawRefresh);
  }

  async updateProfile(userId: string, input: UpdateProfileDto): Promise<UserDto> {
    const firstName = input.firstName?.trim() || null;
    const lastName = input.lastName?.trim() || null;
    if ((firstName?.length ?? 0) > 100 || (lastName?.length ?? 0) > 100) {
      throw new BadRequestException('Names must not exceed 100 characters');
    }
    const data: Prisma.UserUpdateInput = {};
    if ('firstName' in input) data.firstName = firstName;
    if ('lastName' in input) data.lastName = lastName;
    if ('avatarFileId' in input) {
      if (input.avatarFileId !== null && typeof input.avatarFileId !== 'string') {
        throw new BadRequestException('avatarFileId must be a string or null');
      }
      data.avatarFileId = input.avatarFileId ?? null;
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return this.toDto(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) throw new BadRequestException('New password must contain at least 12 characters');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toDto(user);
  }

  async findMany(ids?: string[]): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      where: ids && ids.length > 0 ? { id: { in: ids } } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toDto(user));
  }

  private toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarFileId: user.avatarFileId,
      active: user.active,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
