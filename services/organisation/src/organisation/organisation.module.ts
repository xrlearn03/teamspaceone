import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventsModule } from '../events/events.module.js';
import { InboxModule } from '../inbox/inbox.module.js';
import { HrmsProvisioningConsumer } from '../events/hrms-provisioning.consumer.js';
import { HrmsOffboardingConsumer } from '../events/hrms-offboarding.consumer.js';
import { UserActivationConsumer } from '../events/user-activation.consumer.js';
import { OrganisationService } from './organisation.service.js';
import { RbacReconcileService } from './rbac-reconcile.service.js';
import { OrganisationController } from './organisation.controller.js';
import { InternalOrganisationController } from './internal-organisation.controller.js';
import { AuthorizationService } from './authorization.service.js';
import { OrganisationPermissionGuard } from './permission.guard.js';
import { TicketService } from '../tickets/ticket.service.js';
import { TicketController } from '../tickets/ticket.controller.js';
import { AssetService } from '../assets/asset.service.js';
import { AssetController } from '../assets/asset.controller.js';

@Module({
  imports: [PrismaModule, OutboxModule, EventsModule, InboxModule],
  controllers: [OrganisationController, InternalOrganisationController, TicketController, AssetController],
  providers: [OrganisationService, AuthorizationService, OrganisationPermissionGuard, TicketService, AssetService, HrmsProvisioningConsumer, HrmsOffboardingConsumer, UserActivationConsumer, RbacReconcileService],
  exports: [OrganisationService, AuthorizationService],
})
export class OrganisationModule {}
