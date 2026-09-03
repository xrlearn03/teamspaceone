import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FileProcessingService } from './file-processing.service.js';
import { FileProcessingProcessor } from './file-processing.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'file-processing' }),
    PrismaModule,
    OutboxModule,
    StorageModule,
  ],
  providers: [FileProcessingService, FileProcessingProcessor],
  exports: [FileProcessingService],
})
export class FileProcessingModule {}
