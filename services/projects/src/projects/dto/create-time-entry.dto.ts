export class CreateTimeEntryDto {
  projectId?: string;
  taskId?: string;
  label?: string;
  description?: string;
  date!: string;
  minutes!: number;
  billable?: boolean;
}
