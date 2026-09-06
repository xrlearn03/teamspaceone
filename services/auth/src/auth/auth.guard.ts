import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const internalKey = this.config.get<string>('INTERNAL_API_KEY');
    const providedInternalKey = request.headers['x-internal-api-key'] as string | undefined;
    const internalCaller = request.headers['x-internal-caller'] as string | undefined;
    const auth = request.headers['authorization'] as string | undefined;

    if (
      internalKey &&
      providedInternalKey &&
      internalCaller &&
      !auth
    ) {
      if (this.timingSafeSecretEqual(providedInternalKey, internalKey)) {
        request['user'] = { sub: `service:${internalCaller}`, roles: ['service'] };
        return true;
      }
    }

    const header = auth;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing access token');
    }
    const token = header.slice(7);
    try {
      const payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
      request['user'] = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private timingSafeSecretEqual(a: string, b: string): boolean {
    const aHash = createHash('sha256').update(a).digest();
    const bHash = createHash('sha256').update(b).digest();
    return timingSafeEqual(aHash, bHash);
  }
}
