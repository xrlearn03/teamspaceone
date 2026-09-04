export class CreateProjectDto {
  name!: string;
  description?: string;
  workspaceId?: string;
  clientId?: string;
  memberIds?: string[];
  startDate?: string;
  targetDate?: string;
}
