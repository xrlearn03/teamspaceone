export class UpdateTimeEntryDto {
  projectId?: string | null;
  taskId?: string | null;
  label?: string | null;
  description?: string | null;
  date?: string;
  minutes?: number;
  billable?: boolean;
}
