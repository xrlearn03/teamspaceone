export class CreateMessageDto {
  channelId!: string;
  content!: string;
  attachmentIds?: string[];
  parentMessageId?: string;
}
