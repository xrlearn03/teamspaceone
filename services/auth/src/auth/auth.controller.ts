import { Body, Controller, Get, Headers, Patch, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { type RegisterDto } from './dto/register.dto.js';
import { type LoginDto } from './dto/login.dto.js';
import { type RefreshDto } from './dto/refresh.dto.js';
import { type ChangePasswordDto } from './dto/change-password.dto.js';
import { type UpdateProfileDto } from './dto/update-profile.dto.js';
import { OrganisationContext } from '@teamspace-one/organisation-context';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
