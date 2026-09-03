import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrganisationService } from './organisation.service.js';
import { OrganisationController } from './organisation.controller.js';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [OrganisationController],
  providers: [OrganisationService],
  exports: [OrganisationService],
})
export class OrganisationModule {}
