import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventsModule } from '../events/events.module.js';
import { InboxModule } from '../inbox/inbox.module.js';
import { HrmsProvisioningConsumer } from '../events/hrms-provisioning.consumer.js';
import { HrmsOffboardingConsumer } from '../events/hrms-offboarding.consumer.js';
import { OrganisationService } from './organisation.service.js';
import { OrganisationController } from './organisation.controller.js';
import { AuthorizationService } from './authorization.service.js';
import { OrganisationPermissionGuard } from './permission.guard.js';

@Module({
  imports: [PrismaModule, OutboxModule, EventsModule, InboxModule],
  controllers: [OrganisationController],
  providers: [OrganisationService, AuthorizationService, OrganisationPermissionGuard, HrmsProvisioningConsumer, HrmsOffboardingConsumer],
  exports: [OrganisationService, AuthorizationService],
})
export class OrganisationModule {}
