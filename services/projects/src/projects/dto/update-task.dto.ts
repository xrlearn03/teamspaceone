export class UpdateTaskDto {
  status?: string;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: string;
  position?: number;
}
