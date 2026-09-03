import { Body, Controller, Get, Headers, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { type RegisterDto } from './dto/register.dto.js';
import { type LoginDto } from './dto/login.dto.js';
import { type RefreshDto } from './dto/refresh.dto.js';
import { OrganisationContext } from '@reactify/organisation-context';

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

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Request() req: any) {
    return this.auth.me(req.user.sub as string);
  }
}
