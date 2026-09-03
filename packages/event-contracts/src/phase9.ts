export interface GuestCreatedPayload {
  userId: string;
  email: string;
  organisationId: string;
  invitedBy: string;
}

export interface GuestInvitedPayload {
  email: string;
  organisationId: string;
  projectIds?: string[];
  invitedBy: string;
  token: string;
  expiresAt: string;
}

export interface ClientCreatedPayload {
  clientId: string;
  organisationId: string;
  name: string;
  email?: string;
  clientOrganisationId?: string;
}

export interface ClientProjectCreatedPayload {
  projectId: string;
  organisationId: string;
  clientId: string;
  name: string;
  workspaceId?: string;
}

export interface ApprovalCreatedPayload {
  approvalId: string;
  organisationId: string;
  projectId?: string;
  resourceType: 'task' | 'file' | 'deliverable';
  resourceId: string;
  requestedBy: string;
  requestedAt: string;
  message?: string;
}

export interface ApprovalResolvedPayload {
  approvalId: string;
  organisationId: string;
  status: 'approved' | 'rejected';
  resolvedBy: string;
  resolvedAt: string;
  message?: string;
}

export interface FileSharedExternallyPayload {
  shareId: string;
  fileId: string;
  organisationId: string;
  token: string;
  createdBy: string;
  expiresAt?: string;
  maxViews?: number;
}
