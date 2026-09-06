import {
  BadRequestException,
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

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 200 * 1024 * 1024;

/**
 * Build a safe Content-Disposition header value. The quoted `filename` fallback
 * strips characters that could break out of the header (", \, CR/LF and other
 * control chars); an RFC 5987 `filename*` parameter carries the UTF-8 name.
 */
function contentDisposition(filename: string, type: 'inline' | 'attachment' = 'inline'): string {
  const fallback = filename
    // eslint-disable-next-line no-control-regex
    .replace(/["\\\r\n\x00-\x1f\x7f]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  if (/^[\x20-\x7e]*$/.test(fallback)) {
    return `${type}; filename="${fallback}"`;
  }
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

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
      res.setHeader('Content-Disposition', contentDisposition(originalName));
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
    res.setHeader('Content-Disposition', contentDisposition(name));
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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        // Note: `file.mimetype` is client-supplied; the stored mimeType is kept
        // as-is for backwards compatibility with the presign flow's contract.
        if (!file || (file.size !== undefined && (file.size <= 0 || file.size > MAX_UPLOAD_BYTES))) {
          cb(new BadRequestException('File payload is empty or exceeds the maximum upload size'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @UploadedFile() file: any,
  ) {
    if (!file || !file.size || file.size <= 0) {
      throw new BadRequestException('File payload is empty');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`File exceeds the maximum upload size of ${MAX_UPLOAD_BYTES} bytes`);
    }
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
