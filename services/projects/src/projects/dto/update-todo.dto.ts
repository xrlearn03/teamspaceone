export class UpdateTodoDto {
  title?: string;
  notes?: string | null;
  dueDate?: string | null;
  completed?: boolean;
  position?: number;
}
