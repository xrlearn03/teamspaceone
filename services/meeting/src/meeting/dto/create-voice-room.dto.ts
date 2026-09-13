export class CreateVoiceRoomDto {
  title!: string;
  workspaceId?: string;
  inviteeIds?: string[];
}
