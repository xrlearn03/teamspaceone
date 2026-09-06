export class CreateTaskFromMessageDto {
  projectId!: string;
  messageId!: string;
  channelId?: string;
  title!: string;
  description?: string;
  assigneeId?: string;
  startDate?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
  position?: number;
}
