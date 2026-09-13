import { IsIn } from 'class-validator';

export const TICKET_STATUSES = ['new', 'open', 'pending', 'solved'] as const;

export class UpdateTicketStatusDto {
  @IsIn(TICKET_STATUSES)
  status!: string;
}
