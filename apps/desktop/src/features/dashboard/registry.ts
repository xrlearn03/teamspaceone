import type { AuthorizableUser } from "@teamspace-one/authorization";
import { hasAnyPermission } from "@teamspace-one/authorization";
import type { ComponentType } from "react";
import {
  DailyBriefWidget,
  MyTasksWidget,
  NotificationsWidget,
  PeopleWidget,
  QuickActionsWidget,
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
  /** Permissions (any-of) required to render the widget. */
  permissions: string[];
  component: ComponentType;
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    id: "quick-actions",
    title: "Quick actions",
    gridClass: "md:col-span-2 xl:col-span-3",
    permissions: ["dashboard.quick-action.execute"],
    component: QuickActionsWidget,
  },
  {
    id: "my-tasks",
    title: "My tasks",
    permissions: ["collaboration.task.view"],
    component: MyTasksWidget,
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
  {
    id: "notifications",
    title: "Notifications",
    gridClass: "md:col-span-2 xl:col-span-3",
    permissions: ["dashboard.view"],
    component: NotificationsWidget,
  },
];

export function filterDashboardWidgets(
  user: AuthorizableUser | null,
  widgets: DashboardWidget[] = DASHBOARD_WIDGETS,
): DashboardWidget[] {
  if (!user) return [];
  return widgets.filter((w) => hasAnyPermission(user, w.permissions));
}
