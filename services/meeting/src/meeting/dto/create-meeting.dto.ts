export class CreateMeetingDto {
  title!: string;
  description?: string;
  workspaceId?: string;
  scheduledAt?: string;
  inviteeIds?: string[];
}
