import { Controller, Get, Param } from '@nestjs/common';
import { FileStorageService } from './file-storage.service.js';

@Controller('shares')
export class ExternalShareController {
  constructor(private readonly fileStorage: FileStorageService) {}

  @Get(':token')
  redeem(@Param('token') token: string) {
    return this.fileStorage.redeemExternalShare(token);
  }
}
