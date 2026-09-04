export class CreateChannelDto {
  name!: string;
  workspaceId?: string;
  type?: 'public' | 'private';
  memberIds?: string[];
}
