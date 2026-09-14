import type { AuthorizableUser } from "@teamspace-one/authorization";
import { hasAnyPermission } from "@teamspace-one/authorization";
import type { View } from "../stores/ui";

/**
 * Minimum permissions required to open each top-level view. A view with an
 * empty/absent entry is available to every authenticated organisation member.
 * When a view lists multiple permissions, any one of them is sufficient.
 */
export const VIEW_PERMISSIONS: Partial<Record<View, string[]>> = {
  home: ["dashboard.view", "hrms.access"],
  channel: ["collaboration.access"],
  dm: ["collaboration.access"],
  project: ["collaboration.project.view"],
  "my-projects": ["collaboration.project.view"],
  meeting: ["collaboration.meeting.view"],
  voice: ["collaboration.meeting.view"],
  files: ["collaboration.file.view"],
  members: ["collaboration.access"],
  hrms: ["hrms.access"],
  payroll: ["hrms.payroll.view"],
  interview: ["interview.access"],
  "ai-interview": ["interview.interview.conduct"],
  admin: ["admin.user.manage", "admin.role.manage", "admin.organization.settings"],
  assets: ["admin.asset.view", "admin.user.manage", "admin.role.manage", "admin.organization.settings"],
  tickets: ["collaboration.ticket.view"],
  "hr-dashboard": ["hrms.access"],
  employees: ["hrms.employee.view"],
  "employee-detail": ["hrms.employee.view"],
  departments: ["hrms.department.view"],
  designations: ["hrms.designation.view"],
  leaves: ["hrms.leave.view"],
  attendance: ["hrms.attendance.view"],
  timesheets: ["hrms.attendance.view"],
  offboarding: ["hrms.offboarding.view"],
  onboarding: ["hrms.onboarding.view"],
  "my-attendance": ["hrms.attendance.view", "hrms.attendance.checkin", "hrms.access"],
  "my-timesheet": ["collaboration.access"],
  "my-leaves": ["hrms.leave.view", "hrms.leave.apply", "hrms.access"],
  "my-payroll": ["hrms.payroll.view", "hrms.access"],
  "my-performance": ["hrms.performance.view", "hrms.access"],
};

export function canAccessView(user: AuthorizableUser | null, view: View): boolean {
  const required = VIEW_PERMISSIONS[view];
  if (!required || required.length === 0) return true;
  if (!user) return false;
  if (hasAnyPermission(user, required)) return true;
  // The role seed may grant granular hrms.* permissions without the
  // umbrella "hrms.access"; any hrms.* permission unlocks the module.
  if (view === "hrms" && user.permissions.some((p) => p.startsWith("hrms."))) {
    return true;
  }
  return false;
}
