import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrganisationService } from './organisation.service.js';
import { OrganisationController } from './organisation.controller.js';
import { AuthorizationService } from './authorization.service.js';
import { OrganisationPermissionGuard } from './permission.guard.js';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [OrganisationController],
  providers: [OrganisationService, AuthorizationService, OrganisationPermissionGuard],
  exports: [OrganisationService, AuthorizationService],
})
export class OrganisationModule {}
