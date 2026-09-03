import { Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { FileStorageService } from './file-storage.service.js';

@Controller('files')
export class FileStorageController {
  constructor(private readonly fileStorage: FileStorageService) {}

  @Get()
  async list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.fileStorage.list(ctx);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @UploadedFile() file: any,
  ) {
    return this.fileStorage.upload(ctx, file);
  }
}
