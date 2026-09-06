import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type User } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issuePair(user: User): Promise<TokenPair> {
    const accessTtl = Number(this.config.get('ACCESS_TOKEN_TTL', 900));
    const refreshTtl = Number(this.config.get('REFRESH_TOKEN_TTL', 604800));
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        type: 'access',
      },
      {
        secret,
        expiresIn: accessTtl,
        algorithm: 'HS256',
      },
    );

    const rawRefresh = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: accessTtl,
    };
  }

  async rotate(rawRefresh: string): Promise<TokenPair> {
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const pair = await this.issuePair(existing.user);
    await this.prisma.refreshToken.delete({ where: { id: existing.id } });
    return pair;
  }

  async revoke(rawRefresh: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async revokeByUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
