export class CreateMessageDto {
  channelId!: string;
  content!: string;
  attachmentIds?: string[];
  parentMessageId?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}
