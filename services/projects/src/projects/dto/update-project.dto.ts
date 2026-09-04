export class UpdateProjectDto {
  name?: string;
  description?: string | null;
  status?: string;
  clientId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  memberIds?: string[];
}
