export type PermissionModule =
  | 'dashboard'
  | 'collaboration'
  | 'hrms'
  | 'interview'
  | 'admin';

export type PermissionAction =
  | 'access'
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'manage'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'export'
  | 'process'
  | 'conduct'
  | 'run'
  | 'make'
  | 'checkin'
  | 'checkout'
  | 'upload'
  | 'execute'
  | 'edit-evaluation';

export type PermissionString = `${PermissionModule}.${string}.${PermissionAction}` | '*';

export const DASHBOARD_PERMISSIONS = {
  VIEW: 'dashboard.view',
  WIDGET_VIEW: 'dashboard.widget.view',
  QUICK_ACTION_EXECUTE: 'dashboard.quick-action.execute',
} as const;

export const COLLABORATION_PERMISSIONS = {
  ACCESS: 'collaboration.access',
  WORKSPACE_VIEW: 'collaboration.workspace.view',
  WORKSPACE_CREATE: 'collaboration.workspace.create',
  WORKSPACE_MANAGE: 'collaboration.workspace.manage',
  WORKSPACE_DELETE: 'collaboration.workspace.delete',
  TEAM_VIEW: 'collaboration.team.view',
  TEAM_CREATE: 'collaboration.team.create',
  TEAM_MANAGE: 'collaboration.team.manage',
  TEAM_DELETE: 'collaboration.team.delete',
  CHANNEL_VIEW: 'collaboration.channel.view',
  CHANNEL_CREATE: 'collaboration.channel.create',
  CHANNEL_MANAGE: 'collaboration.channel.manage',
  CHANNEL_DELETE: 'collaboration.channel.delete',
  MESSAGE_VIEW: 'collaboration.message.view',
  MESSAGE_SEND: 'collaboration.message.send',
  MESSAGE_EDIT: 'collaboration.message.edit',
  MESSAGE_DELETE: 'collaboration.message.delete',
  FILE_VIEW: 'collaboration.file.view',
  FILE_UPLOAD: 'collaboration.file.upload',
  FILE_DELETE: 'collaboration.file.delete',
  PROJECT_VIEW: 'collaboration.project.view',
  PROJECT_CREATE: 'collaboration.project.create',
  PROJECT_MANAGE: 'collaboration.project.manage',
  PROJECT_DELETE: 'collaboration.project.delete',
  TASK_VIEW: 'collaboration.task.view',
  TASK_CREATE: 'collaboration.task.create',
  TASK_ASSIGN: 'collaboration.task.assign',
  TASK_EDIT: 'collaboration.task.edit',
  TASK_DELETE: 'collaboration.task.delete',
  MEETING_VIEW: 'collaboration.meeting.view',
  MEETING_CREATE: 'collaboration.meeting.create',
  MEETING_CONDUCT: 'collaboration.meeting.conduct',
  MEETING_DELETE: 'collaboration.meeting.delete',
  TICKET_VIEW: 'collaboration.ticket.view',
  TICKET_CREATE: 'collaboration.ticket.create',
  TICKET_MANAGE: 'collaboration.ticket.manage',
} as const;

export const HRMS_PERMISSIONS = {
  ACCESS: 'hrms.access',
  EMPLOYEE_VIEW: 'hrms.employee.view',
  EMPLOYEE_CREATE: 'hrms.employee.create',
  EMPLOYEE_EDIT: 'hrms.employee.edit',
  EMPLOYEE_DELETE: 'hrms.employee.delete',
  EMPLOYEE_EXPORT: 'hrms.employee.export',
  DEPARTMENT_VIEW: 'hrms.department.view',
  DEPARTMENT_CREATE: 'hrms.department.create',
  DEPARTMENT_EDIT: 'hrms.department.edit',
  DEPARTMENT_DELETE: 'hrms.department.delete',
  DESIGNATION_VIEW: 'hrms.designation.view',
  DESIGNATION_CREATE: 'hrms.designation.create',
  DESIGNATION_EDIT: 'hrms.designation.edit',
  DESIGNATION_DELETE: 'hrms.designation.delete',
  ORG_CHART_VIEW: 'hrms.org-chart.view',
  ATTENDANCE_VIEW: 'hrms.attendance.view',
  ATTENDANCE_CHECKIN: 'hrms.attendance.checkin',
  ATTENDANCE_CHECKOUT: 'hrms.attendance.checkout',
  ATTENDANCE_MANAGE: 'hrms.attendance.manage',
  ATTENDANCE_APPROVE: 'hrms.attendance.approve',
  LEAVE_VIEW: 'hrms.leave.view',
  LEAVE_APPLY: 'hrms.leave.apply',
  LEAVE_APPROVE: 'hrms.leave.approve',
  LEAVE_REJECT: 'hrms.leave.reject',
  LEAVE_MANAGE: 'hrms.leave.manage',
  PAYROLL_VIEW: 'hrms.payroll.view',
  PAYROLL_MANAGE: 'hrms.payroll.manage',
  PAYROLL_PROCESS: 'hrms.payroll.process',
  PAYROLL_EXPORT: 'hrms.payroll.export',
  DOCUMENT_VIEW: 'hrms.document.view',
  DOCUMENT_UPLOAD: 'hrms.document.upload',
  DOCUMENT_DELETE: 'hrms.document.delete',
  RECRUITMENT_VIEW: 'hrms.recruitment.view',
  ONBOARDING_VIEW: 'hrms.onboarding.view',
  ONBOARDING_MANAGE: 'hrms.onboarding.manage',
  OFFBOARDING_VIEW: 'hrms.offboarding.view',
  OFFBOARDING_MANAGE: 'hrms.offboarding.manage',
  PERFORMANCE_VIEW: 'hrms.performance.view',
  PERFORMANCE_MANAGE: 'hrms.performance.manage',
  ANALYTICS_VIEW: 'hrms.analytics.view',
  ANALYTICS_EXPORT: 'hrms.analytics.export',
} as const;

export const INTERVIEW_PERMISSIONS = {
  ACCESS: 'interview.access',
  JOB_VIEW: 'interview.job.view',
  JOB_CREATE: 'interview.job.create',
  JOB_EDIT: 'interview.job.edit',
  JOB_DELETE: 'interview.job.delete',
  CANDIDATE_VIEW: 'interview.candidate.view',
  CANDIDATE_CREATE: 'interview.candidate.create',
  CANDIDATE_EDIT: 'interview.candidate.edit',
  CANDIDATE_DELETE: 'interview.candidate.delete',
  CANDIDATE_EXPORT: 'interview.candidate.export',
  SCREENING_VIEW: 'interview.screening.view',
  SCREENING_RUN: 'interview.screening.run',
  TEMPLATE_VIEW: 'interview.template.view',
  TEMPLATE_CREATE: 'interview.template.create',
  TEMPLATE_EDIT: 'interview.template.edit',
  TEMPLATE_DELETE: 'interview.template.delete',
  INTERVIEW_VIEW: 'interview.interview.view',
  INTERVIEW_SCHEDULE: 'interview.interview.schedule',
  INTERVIEW_CONDUCT: 'interview.interview.conduct',
  INTERVIEW_EVALUATE: 'interview.interview.evaluate',
  INTERVIEW_EDIT_EVALUATION: 'interview.interview.edit-evaluation',
  INTERVIEW_APPROVE: 'interview.interview.approve',
  DECISION_VIEW: 'interview.decision.view',
  DECISION_MAKE: 'interview.decision.make',
  ANALYTICS_VIEW: 'interview.analytics.view',
} as const;

export const ADMIN_PERMISSIONS = {
  USER_MANAGE: 'admin.user.manage',
  ROLE_MANAGE: 'admin.role.manage',
  PERMISSION_MANAGE: 'admin.permission.manage',
  AUDIT_VIEW: 'admin.audit.view',
  ORGANIZATION_SETTINGS: 'admin.organization.settings',
  ORGANIZATION_BILLING: 'admin.organization.billing',
  SYSTEM_SETTINGS: 'admin.system.settings',
  ASSET_VIEW: 'admin.asset.view',
  ASSET_CREATE: 'admin.asset.create',
  ASSET_EDIT: 'admin.asset.edit',
  ASSET_DELETE: 'admin.asset.delete',
  ASSET_ASSIGN: 'admin.asset.assign',
} as const;

export const ALL_PERMISSIONS: readonly string[] = Object.freeze([
  ...Object.values(DASHBOARD_PERMISSIONS),
  ...Object.values(COLLABORATION_PERMISSIONS),
  ...Object.values(HRMS_PERMISSIONS),
  ...Object.values(INTERVIEW_PERMISSIONS),
  ...Object.values(ADMIN_PERMISSIONS),
]);

/**
 * Canonical permission string for a registry row. Two-part permissions such
 * as 'hrms.access' are stored with resource='*' so the
 * (module, resource, action) key reconstructs to the original string.
 */
export function permissionKey(module: string, resource: string, action: string): string {
  return resource === '*' ? `${module}.${action}` : `${module}.${resource}.${action}`;
}

/** Split a canonical permission string into registry columns. */
export function permissionParts(permission: string): { module: string; resource: string; action: string } {
  const parts = permission.split('.');
  if (parts.length === 2) {
    return { module: parts[0], resource: '*', action: parts[1] };
  }
  return { module: parts[0] ?? '', resource: parts[1] ?? '', action: parts[2] ?? '' };
}

export function isValidPermission(value: string): boolean {
  if (value === '*') return true;
  return ALL_PERMISSIONS.includes(value);
}

export function permissionMatches(granted: string, required: string): boolean {
  if (granted === '*') return true;
  if (granted === required) return true;

  const grantedParts = granted.split('.');
  const requiredParts = required.split('.');

  if (grantedParts.length > requiredParts.length) {
    return false;
  }

  // A grant may be shorter than the required permission only when it ends
  // in a wildcard segment (e.g. 'hrms.*' covers 'hrms.employee.view' and
  // 'hrms.access').
  if (grantedParts.length < requiredParts.length && grantedParts[grantedParts.length - 1] !== '*') {
    return false;
  }

  for (let i = 0; i < grantedParts.length; i++) {
    if (grantedParts[i] === '*') continue;
    if (grantedParts[i] !== requiredParts[i]) return false;
  }

  return true;
}
