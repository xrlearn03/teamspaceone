import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FileProcessingModule } from '../file-processing/file-processing.module.js';
import { FileStorageService } from './file-storage.service.js';
import { FileStorageController } from './file-storage.controller.js';

@Module({
  imports: [OutboxModule, StorageModule, FileProcessingModule],
  controllers: [FileStorageController],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}
