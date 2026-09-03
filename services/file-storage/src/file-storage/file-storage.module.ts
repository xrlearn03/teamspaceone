import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { FileStorageService } from './file-storage.service.js';
import { FileStorageController } from './file-storage.controller.js';

@Module({
  imports: [OutboxModule],
  controllers: [FileStorageController],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}
