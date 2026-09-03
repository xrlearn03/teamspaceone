import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { FileStorageService } from './file-storage.service.js';
import { PresignUploadDto } from './dto/presign-upload.dto.js';
import { CompleteUploadDto } from './dto/complete-upload.dto.js';

@Controller('files')
export class FileStorageController {
  constructor(private readonly fileStorage: FileStorageService) {}

  @Get()
  async list(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.fileStorage.list(ctx);
  }

  @Get(':id')
  async get(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.fileStorage.getById(ctx, id);
  }

  @Get(':id/download')
  async download(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Query('redirect') redirect: string,
    @Res() res: Response,
  ) {
    const signedUrl = await this.fileStorage.getSignedDownloadUrl(ctx, id);
    if (redirect === 'true' || redirect === '1') {
      return res.redirect(signedUrl);
    }
    return res.json({ downloadUrl: signedUrl });
  }

  @Post('presign-upload')
  async presignUpload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: PresignUploadDto,
  ) {
    return this.fileStorage.presignUpload(ctx, dto);
  }

  @Post(':id/complete')
  async completeUpload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() _dto: CompleteUploadDto,
  ) {
    return this.fileStorage.completeUpload(ctx, id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @UploadedFile() file: any,
  ) {
    return this.fileStorage.upload(ctx, file);
  }

  @Delete(':id')
  async delete(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.fileStorage.delete(ctx, id);
  }
}
