export class UpdateProjectDto {
  name?: string;
  description?: string | null;
  status?: string;
  startDate?: string | null;
  targetDate?: string | null;
  memberIds?: string[];
}
