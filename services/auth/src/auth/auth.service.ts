import { BadRequestException, Injectable, UnauthorizedException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { createEventEnvelope, Subjects, type PasswordResetRequestedPayload } from '@teamspace-one/event-contracts';
import { OrganisationContext } from '@teamspace-one/organisation-context';
import { Prisma, type User } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { TokenService, type TokenPair } from './token.service.js';
import { type RegisterDto } from './dto/register.dto.js';
import { type ProvisionUserDto } from './dto/provision-user.dto.js';
import { type LoginDto } from './dto/login.dto.js';
import { type RedeemInvitationDto } from './dto/redeem-invitation.dto.js';
import { type UserDto } from './dto/user.dto.js';
import { type UpdateProfileDto } from './dto/update-profile.dto.js';

export interface UserProfileDto {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
  status: 'active' | 'inactive';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly tokens: TokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private assertPasswordPolicy(password: string): void {
    if (!password || password.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters');
    }
  }

  private s2sHeaders(): Record<string, string> {
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!internalApiKey) {
      throw new Error('INTERNAL_API_KEY is not configured');
    }
    const ctx = OrganisationContext.get();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-internal-api-key': internalApiKey,
      'x-internal-caller': 'auth-service',
    };
    if (ctx?.actorId) {
      headers['x-actor-id'] = ctx.actorId;
    }
    if (ctx?.organisationId && ctx.organisationId !== 'unknown') {
      headers['x-organisation-id'] = ctx.organisationId;
    }
    return headers;
  }

  async register(input: RegisterDto, correlationId?: string): Promise<{ user: UserDto; tokens: TokenPair }> {
    if (!input?.email || !input?.password) {
      throw new BadRequestException('Email and password are required');
    }
    this.assertPasswordPolicy(input.password);
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

  /**
   * Service-to-service provisioning: an admin invite creates the user account
   * up-front with a generated temporary password. The user must replace it on
   * first login (mustChangePassword). Existing accounts are returned as-is —
   * their password is never reset by this path.
   */
  async provisionUser(
    input: ProvisionUserDto,
    correlationId?: string,
  ): Promise<{ user: UserDto; temporaryPassword: string | null; accountCreated: boolean }> {
    if (!input?.email) {
      throw new BadRequestException('Email is required');
    }
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { user: this.toDto(existing), temporaryPassword: null, accountCreated: false };
    }

    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await hash(temporaryPassword, 12);
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
        email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      },
    });

    const user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.user.create({
        data: {
          id,
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          mustChangePassword: true,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.USER_CREATED);
      return created;
    });

    return { user: this.toDto(user), temporaryPassword, accountCreated: true };
  }

  /**
   * Service-to-service: regenerate a temporary password for an invited account
   * that has not yet activated (mustChangePassword still true). Used when an
   * admin resends an invitation. Activated accounts are never reset here.
   */
  async resetTemporaryPassword(userId: string): Promise<{ user: UserDto; temporaryPassword: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.mustChangePassword) {
      throw new ConflictException('Account is already activated');
    }

    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await hash(temporaryPassword, 12);
    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const u = await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      return u;
    });
    return { user: this.toDto(updated), temporaryPassword };
  }

  /**
   * Service-to-service: delete an invited account that never activated
   * (mustChangePassword still true). Activated accounts are refused so an
   * admin revoke can never delete a real user account.
   */
  async deleteUnactivatedUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return;
    }
    if (!user.mustChangePassword) {
      throw new ConflictException('Account is already activated');
    }
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
  }

  async requestPasswordReset(email: string, correlationId?: string): Promise<{ requested: boolean }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      return { requested: true };
    }

    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        email: normalized,
        type: 'reset',
      },
      {
        secret,
        expiresIn: '15m',
        audience: 'password-reset',
        algorithm: 'HS256',
      },
    );

    const envelope = createEventEnvelope<PasswordResetRequestedPayload>({
      eventType: Subjects.PASSWORD_RESET_REQUESTED,
      organisationId: 'global',
      actorId: user.id,
      resourceType: 'user',
      resourceId: user.id,
      correlationId,
      payload: { email: normalized, token },
    });

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.outbox.createEvent(tx, envelope, Subjects.PASSWORD_RESET_REQUESTED);
    });

    return { requested: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ reset: boolean }> {
    this.assertPasswordPolicy(newPassword);

    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    let payload: { sub?: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret,
        audience: 'password-reset',
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (payload.type !== 'reset' || !payload.sub) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await hash(newPassword, 12);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
    });

    return { reset: true };
  }

  async redeemInvitation(input: RedeemInvitationDto, correlationId?: string): Promise<{ user: UserDto; tokens: TokenPair }> {
    if (!input?.email || !input?.password || !input?.token) {
      throw new BadRequestException('Token, email and password are required');
    }
    this.assertPasswordPolicy(input.password);

    const organisationUrl = this.config.get<string>('ORGANISATION_SERVICE_URL');
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!organisationUrl || !internalApiKey) {
      throw new BadRequestException('Organisation integration not configured');
    }

    const lookupRes = await fetch(`${organisationUrl}/organisations/invitations/${encodeURIComponent(input.token)}`, {
      headers: this.s2sHeaders(),
    });
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
      headers: this.s2sHeaders(),
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
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      if (user.mustChangePassword) {
        const envelope = createEventEnvelope({
          eventType: Subjects.USER_UPDATED,
          organisationId: 'global',
          actorId: userId,
          resourceType: 'user',
          resourceId: userId,
          payload: { id: userId, email: user.email, activated: true },
        });
        await this.outbox.createEvent(tx, envelope, Subjects.USER_UPDATED);
      }
    });
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toDto(user);
  }

  async findById(id: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toProfileDto(user);
  }

  async findByIdInternal(id: string): Promise<UserDto | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return this.toDto(user);
  }

  async findMany(ids: string[]): Promise<UserDto[]> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('ids query parameter is required');
    }
    if (ids.length > 100) {
      throw new BadRequestException('Cannot request more than 100 users at a time');
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
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
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toProfileDto(user: User): UserProfileDto {
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    return {
      id: user.id,
      email: user.email,
      displayName,
      avatar: user.avatarFileId,
      status: user.active ? 'active' : 'inactive',
    };
  }
}
