import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export interface TicketAttachmentInput {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
}

export class CreateTicketDto {
  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(5000)
  description!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsIn(TICKET_PRIORITIES)
  priority!: string;

  @IsString()
  assigneeRoleId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  attachments?: TicketAttachmentInput[];
}
