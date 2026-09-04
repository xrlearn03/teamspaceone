export class CreateApprovalDto {
  projectId?: string;
  resourceType!: 'task' | 'file' | 'deliverable';
  resourceId!: string;
  message?: string;
}
