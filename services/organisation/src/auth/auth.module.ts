import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';

@Module({
  imports: [OutboxModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, AuthGuard],
  exports: [AuthService, TokenService, AuthGuard],
})
export class AuthModule {}
