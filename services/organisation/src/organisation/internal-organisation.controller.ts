import { Controller, ForbiddenException, Get, Headers, Param, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { OrganisationService } from './organisation.service.js';

@Controller('internal/organisations')
export class InternalOrganisationController {
  constructor(
    private readonly organisation: OrganisationService,
    private readonly config: ConfigService,
  ) {}

  @Get(':id/email-provider')
  async getEmailProvider(
    @Param('id') organisationId: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
  ) {
    this.assertNotificationCaller(internalApiKey, internalCaller);
    return this.organisation.getEmailProvider(organisationId, true);
  }

  @Get('users/:userId/email-provider')
  async getEmailProviderForUser(
    @Param('userId') userId: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
  ) {
    this.assertNotificationCaller(internalApiKey, internalCaller);
    return this.organisation.getEmailProviderForUser(userId);
  }

  @Get(':id/members-by-role')
  async getMembersByRole(
    @Param('id') organisationId: string,
    @Query('names') names?: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
  ) {
    this.assertNotificationCaller(internalApiKey, internalCaller);
    const roleNames = (names ?? '').split(',');
    return this.organisation.listMemberUserIdsByRoleNames(organisationId, roleNames);
  }

  private assertNotificationCaller(internalApiKey?: string, internalCaller?: string): void {
    if (!internalApiKey || !internalCaller) {
      throw new UnauthorizedException('Unauthorized');
    }
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    if (!expected) {
      throw new UnauthorizedException('Service authentication is not configured');
    }
    const a = createHash('sha256').update(internalApiKey).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b)) {
      throw new ForbiddenException('Forbidden');
    }
    if (internalCaller !== 'notification-service') {
      throw new ForbiddenException('Forbidden caller');
    }
  }
}
