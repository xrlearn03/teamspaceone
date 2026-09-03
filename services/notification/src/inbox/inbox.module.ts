import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InboxService } from './inbox.service.js';

@Module({
  imports: [PrismaModule],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
