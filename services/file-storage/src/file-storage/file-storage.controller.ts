import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { COLLABORATION_PERMISSIONS, HRMS_PERMISSIONS, type AuthorizableUser } from '@teamspace-one/authorization';
import { FileStorageService } from './file-storage.service.js';
import { PresignUploadDto } from './dto/presign-upload.dto.js';
import { CompleteUploadDto } from './dto/complete-upload.dto.js';
import { CreateExternalShareDto } from './dto/create-external-share.dto.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';

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

@UseGuards(RemotePermissionGuard)
@Controller('files')
export class FileStorageController {
  constructor(private readonly fileStorage: FileStorageService) {}

  @Get('usage')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  async usage(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.fileStorage.getUsage(ctx);
  }

  @Get()
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  async list(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('folderId') folderId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return this.fileStorage.list(ctx, folderId, resourceType, resourceId);
  }

  @Post('folders')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_UPLOAD)
  async createFolder(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateFolderDto,
  ) {
    return this.fileStorage.createFolder(ctx, dto);
  }

  @Get('folders')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  async listFolders(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Query('category') category?: string,
  ) {
    return this.fileStorage.listFolders(ctx, category);
  }

  @Get(':id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  async get(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.fileStorage.getById(ctx, id);
  }

  @Get(':id/versions')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  async listVersions(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.fileStorage.listVersions(ctx, id);
  }

  @Get(':id/download')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
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
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
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
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_UPLOAD)
  async presignUpload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: PresignUploadDto,
    @Req() req: { user?: AuthorizableUser },
  ) {
    return this.fileStorage.presignUpload(ctx, dto, req.user);
  }

  @Post(':id/complete')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_UPLOAD)
  async completeUpload(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.fileStorage.completeUpload(ctx, id, dto);
  }

  @Post('upload')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_UPLOAD)
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
    @Body() body: { resourceType?: string; resourceId?: string; metadata?: string },
  ) {
    if (!file || !file.size || file.size <= 0) {
      throw new BadRequestException('File payload is empty');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`File exceeds the maximum upload size of ${MAX_UPLOAD_BYTES} bytes`);
    }
    let metadata: Record<string, unknown> | undefined;
    if (body?.metadata) {
      try {
        const parsed = JSON.parse(body.metadata) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        if (JSON.stringify(parsed).length > 8192) throw new Error('too large');
        metadata = parsed as Record<string, unknown>;
      } catch {
        throw new BadRequestException('metadata must be a JSON object of at most 8KB');
      }
    }
    return this.fileStorage.upload(ctx, file, {
      resourceType: body?.resourceType,
      resourceId: body?.resourceId,
      metadata,
    });
  }

  @Get(':id/shares')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  listShares(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') id: string) {
    return this.fileStorage.listExternalShares(ctx, id);
  }

  @Post(':id/shares')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_UPLOAD)
  createShare(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') id: string, @Body() dto: CreateExternalShareDto) {
    return this.fileStorage.createExternalShare(ctx, id, dto);
  }

  @Delete('shares/:shareId')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_DELETE)
  async revokeShare(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('shareId') shareId: string) {
    await this.fileStorage.revokeExternalShare(ctx, shareId);
  }

  @Delete(':id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_DELETE)
  async delete(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.fileStorage.delete(ctx, id);
  }
}
