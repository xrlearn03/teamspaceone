import { Injectable } from '@nestjs/common';
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

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        type: 'access',
      },
      {
        secret: this.config.get<string>('JWT_SECRET', 'change-me'),
        expiresIn: accessTtl,
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

    const existing = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!row || row.expiresAt < new Date()) {
        return null;
      }

      await tx.refreshToken.delete({ where: { id: row.id } });
      return row.user;
    });

    if (!existing) {
      throw new Error('Invalid or expired refresh token');
    }

    return this.issuePair(existing);
  }

  async revokeByUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
