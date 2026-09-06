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
import { pipeline } from 'node:stream/promises';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { FileStorageService } from './file-storage.service.js';
import { PresignUploadDto } from './dto/presign-upload.dto.js';
import { CompleteUploadDto } from './dto/complete-upload.dto.js';
import { CreateExternalShareDto } from './dto/create-external-share.dto.js';

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
    @Query('stream') stream: string,
    @Res() res: Response,
  ) {
    if (stream === 'true' || stream === '1') {
      const { stream: fileStream, contentType, contentLength, originalName, mimeType } = await this.fileStorage.getFileStream(ctx, id);
      res.setHeader('Content-Type', contentType ?? mimeType ?? 'application/octet-stream');
      if (contentLength) res.setHeader('Content-Length', String(contentLength));
      res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
      await pipeline(fileStream, res);
      return;
    }

    const signedUrl = await this.fileStorage.getSignedDownloadUrl(ctx, id);
    if (redirect === 'true' || redirect === '1') {
      return res.redirect(signedUrl);
    }
    return res.json({ downloadUrl: signedUrl });
  }

  @Get(':id/preview')
  async preview(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Query('type') type: string,
    @Res() res: Response,
  ) {
    const previewType = type === 'thumbnail' ? 'thumbnail' : 'preview';
    const { stream: previewStream, contentType, contentLength, name, mimeType } = await this.fileStorage.getPreviewStream(ctx, id, previewType);
    res.setHeader('Content-Type', contentType ?? mimeType ?? 'application/octet-stream');
    if (contentLength) res.setHeader('Content-Length', String(contentLength));
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    await pipeline(previewStream, res);
    return;
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
    @Body() dto: CompleteUploadDto,
  ) {
    return this.fileStorage.completeUpload(ctx, id, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @UploadedFile() file: any,
  ) {
    return this.fileStorage.upload(ctx, file);
  }

  @Get(':id/shares')
  listShares(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') id: string) {
    return this.fileStorage.listExternalShares(ctx, id);
  }

  @Post(':id/shares')
  createShare(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') id: string, @Body() dto: CreateExternalShareDto) {
    return this.fileStorage.createExternalShare(ctx, id, dto);
  }

  @Delete('shares/:shareId')
  async revokeShare(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('shareId') shareId: string) {
    await this.fileStorage.revokeExternalShare(ctx, shareId);
  }

  @Delete(':id')
  async delete(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.fileStorage.delete(ctx, id);
  }
}
