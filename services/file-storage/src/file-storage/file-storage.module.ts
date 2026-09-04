import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FileProcessingModule } from '../file-processing/file-processing.module.js';
import { FileStorageService } from './file-storage.service.js';
import { FileStorageController } from './file-storage.controller.js';
import { ExternalShareController } from './external-share.controller.js';

@Module({
  imports: [OutboxModule, StorageModule, FileProcessingModule, PrismaModule],
  controllers: [FileStorageController, ExternalShareController],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}
