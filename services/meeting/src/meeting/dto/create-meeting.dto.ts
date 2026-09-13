export class CreateMeetingDto {
  title!: string;
  description?: string;
  workspaceId?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  recurrence?: string;
  inviteeIds?: string[];
}
