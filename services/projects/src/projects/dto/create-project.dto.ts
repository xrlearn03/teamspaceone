export class CreateProjectDto {
  name!: string;
  description?: string;
  workspaceId?: string;
  memberIds?: string[];
  startDate?: string;
  targetDate?: string;
}
