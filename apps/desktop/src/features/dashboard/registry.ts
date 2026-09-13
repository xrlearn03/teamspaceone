import type { AuthorizableUser, ScopeType } from "@teamspace-one/authorization";
import { hasAnyPermission } from "@teamspace-one/authorization";
import type { ComponentType } from "react";
import {
  CandidatePipelineWidget,
  DailyBriefWidget,
  HrmsOverviewWidget,
  InterviewsTodayWidget,
  OpenPositionsWidget,
  PendingEvaluationsWidget,
  MyAttendanceWidget,
  MyLeaveWidget,
  MyTasksWidget,
  PendingHrApprovalsWidget,
  PeopleWidget,
  RecentConversationsWidget,
  RecentProjectsWidget,
  UpcomingMeetingsWidget,
} from "./widgets";

/**
 * A dashboard widget. Widgets declare the permissions required to see them;
 * the dashboard shell renders only the widgets the current user can access.
 * `permissions` uses "any of" semantics.
 */
export interface DashboardWidget {
  id: string;
  title: string;
  /** Grid span classes applied to the widget wrapper. */
  gridClass?: string;
  /** Render above the grid at natural height instead of inside a grid row. */
  banner?: boolean;
  /** Permissions (any-of) required to render the widget. */
  permissions: string[];
  /**
   * Hide the widget when every scope the user holds for the widget's module
   * is in this list. E.g. `excludeScopeTypes: ["own"]` hides recruiter views
   * from candidate accounts that only have interview `own` scope.
   */
  excludeScopeTypes?: ScopeType[];
  component: ComponentType;
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    id: "my-tasks",
    title: "My tasks",
    permissions: ["collaboration.task.view"],
    component: MyTasksWidget,
  },
  {
    id: "my-attendance",
    title: "My attendance",
    permissions: ["hrms.attendance.view"],
    component: MyAttendanceWidget,
  },
  {
    id: "my-leave",
    title: "My leave",
    permissions: ["hrms.leave.view"],
    component: MyLeaveWidget,
  },
  {
    id: "upcoming-meetings",
    title: "Upcoming meetings",
    permissions: ["collaboration.meeting.view"],
    component: UpcomingMeetingsWidget,
  },
  {
    id: "recent-conversations",
    title: "Recent conversations",
    permissions: ["collaboration.message.view"],
    component: RecentConversationsWidget,
  },
  {
    id: "recent-projects",
    title: "Recent projects",
    permissions: ["collaboration.project.view"],
    component: RecentProjectsWidget,
  },
  {
    id: "hrms-overview",
    title: "People overview",
    permissions: ["hrms.analytics.view"],
    component: HrmsOverviewWidget,
  },
  {
    id: "pending-hr-approvals",
    title: "Pending approvals",
    permissions: ["hrms.leave.approve", "hrms.attendance.approve"],
    component: PendingHrApprovalsWidget,
  },
  {
    id: "open-positions",
    title: "Open positions",
    permissions: ["interview.job.view"],
    excludeScopeTypes: ["own"],
    component: OpenPositionsWidget,
  },
  {
    id: "candidate-pipeline",
    title: "Candidate pipeline",
    permissions: ["interview.candidate.view"],
    excludeScopeTypes: ["own"],
    component: CandidatePipelineWidget,
  },
  {
    id: "interviews-today",
    title: "Interviews",
    permissions: ["interview.interview.view"],
    component: InterviewsTodayWidget,
  },
  {
    id: "pending-evaluations",
    title: "Pending evaluations",
    permissions: ["interview.interview.evaluate", "interview.decision.view"],
    component: PendingEvaluationsWidget,
  },
  {
    id: "people",
    title: "People",
    permissions: ["hrms.employee.view"],
    component: PeopleWidget,
  },
  {
    id: "daily-brief",
    title: "AI daily brief",
    gridClass: "md:col-span-2 xl:col-span-1",
    permissions: ["dashboard.widget.view"],
    component: DailyBriefWidget,
  },
];

export function filterDashboardWidgets(
  user: AuthorizableUser | null,
  widgets: DashboardWidget[] = DASHBOARD_WIDGETS,
): DashboardWidget[] {
  if (!user) return [];
  return widgets.filter((w) => {
    if (!hasAnyPermission(user, w.permissions)) return false;
    if (w.excludeScopeTypes?.length) {
      const module = w.permissions[0]?.split(".")[0] ?? "*";
      const scopeTypes = new Set(
        (user.dataScopes ?? [])
          .filter((s) => s.module === module || s.module === "*")
          .map((s) => s.scope),
      );
      if (scopeTypes.size > 0 && [...scopeTypes].every((s) => w.excludeScopeTypes!.includes(s))) {
        return false;
      }
    }
    return true;
  });
}
