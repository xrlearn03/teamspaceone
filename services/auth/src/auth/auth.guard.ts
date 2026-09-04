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

    if (internalKey && providedInternalKey && internalKey === providedInternalKey) {
      request['user'] = { sub: 'internal-service', roles: ['service'] };
      return true;
    }

    const header = request.headers['authorization'] as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing access token');
    }
    const token = header.slice(7);
    try {
      const payload = await this.jwt.verifyAsync(token);
      request['user'] = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
