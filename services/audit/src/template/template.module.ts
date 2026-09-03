import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { TemplateService } from './template.service.js';
import { TemplateController } from './template.controller.js';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [TemplateController],
  providers: [TemplateService],
})
export class TemplateModule {}
