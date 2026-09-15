import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

@Module({
  imports: [PrismaModule, OrganisationModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminGuard],
})
export class PlatformModule {}
