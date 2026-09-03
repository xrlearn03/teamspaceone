export class PresignUploadDto {
  fileName!: string;
  mimeType!: string;
  size!: number;
  category!: string;
  resourceType?: string;
  resourceId?: string;
  workspaceId?: string;
}
