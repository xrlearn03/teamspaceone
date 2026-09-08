export class PresignUploadDto {
  fileName!: string;
  mimeType!: string;
  size!: number;
  category!: string;
  resourceType?: string;
  resourceId?: string;
  workspaceId?: string;
  folderId?: string;
  sha256!: string;
}
