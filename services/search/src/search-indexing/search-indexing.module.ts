import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SearchModule } from '../search/search.module.js';
import { SearchIndexingService } from './search-indexing.service.js';
import { SearchIndexingProcessor } from './search-indexing.processor.js';
import { SearchIndexingController } from './search-indexing.controller.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'search-indexing' }), PrismaModule, SearchModule],
  providers: [SearchIndexingService, SearchIndexingProcessor],
  controllers: [SearchIndexingController],
  exports: [SearchIndexingService],
})
export class SearchIndexingModule {}
