import { createHash, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Delete, ForbiddenException, Get, Headers, NotFoundException, Param, Patch, Post, Query, UnauthorizedException, UseGuards, Request } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto.js';
import { ProvisionUserDto } from './dto/provision-user.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { OrganisationContext } from '@teamspace-one/organisation-context';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    const ctx = OrganisationContext.get();
    return this.auth.register(dto, ctx?.correlationId ?? correlationId);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('redeem')
  async redeemInvitation(
    @Body() dto: RedeemInvitationDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    const ctx = OrganisationContext.get();
    return this.auth.redeemInvitation(dto, ctx?.correlationId ?? correlationId);
  }

  private assertInternal(
    internalApiKey: string | undefined,
    internalCaller: string | undefined,
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
  }

  /**
   * Service-to-service only: provision a user account for an admin-driven
   * invite. The gateway strips `x-internal-caller` from inbound client
   * traffic, so only trusted services can satisfy both checks.
   */
  @Post('internal/provision')
  async provisionUser(
    @Body() dto: ProvisionUserDto,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    this.assertInternal(internalApiKey, internalCaller);
    const ctx = OrganisationContext.get();
    return this.auth.provisionUser(dto, ctx?.correlationId ?? correlationId);
  }

  /**
   * Service-to-service only: fetch a user record by id.
   */
  @Get('internal/users/:id')
  async internalFindById(
    @Param('id') id: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
  ) {
    this.assertInternal(internalApiKey, internalCaller);
    const user = await this.auth.findByIdInternal(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Service-to-service only: regenerate a temporary password for an invited
   * account that has not activated yet (used when resending an invitation).
   */
  @Post('internal/users/:id/reset-temporary-password')
  async resetTemporaryPassword(
    @Param('id') id: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
  ) {
    this.assertInternal(internalApiKey, internalCaller);
    return this.auth.resetTemporaryPassword(id);
  }

  /**
   * Service-to-service only: delete an invited account that never activated.
   * Refuses to delete accounts that have already set a real password.
   */
  @Delete('internal/users/:id')
  async deleteUnactivatedUser(
    @Param('id') id: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Headers('x-internal-caller') internalCaller?: string,
  ) {
    this.assertInternal(internalApiKey, internalCaller);
    await this.auth.deleteUnactivatedUser(id);
    return { deleted: true };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.sub as string, dto);
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(req.user.sub as string, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Request() req: any) {
    return this.auth.me(req.user.sub as string);
  }

  @Get('users')
  @UseGuards(AuthGuard)
  async list(@Query('ids') ids?: string | string[]) {
    let idList: string[] = [];
    if (typeof ids === 'string') {
      idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(ids)) {
      idList = ids as string[];
    }
    return this.auth.findMany(idList);
  }

  @Get('users/:id')
  @UseGuards(AuthGuard)
  async getById(@Param('id') id: string) {
    return this.auth.findById(id);
  }
}
