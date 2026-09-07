# Dashboard Architecture

Teamspace One uses a **permission-filtered widget registry** rather than a fixed
dashboard per role. Every user sees a personalised dashboard composed only of
widgets they are authorised to view.

## Flow

```text
Sign in
  → PermissionBoundary (App.tsx) fetches GET /organisations/:id/me/context
  → PermissionProvider exposes AuthorizableUser to the tree
  → HomeScreen calls filterDashboardWidgets(user)
  → Only widgets whose `permissions` (any-of) match are rendered
```

## Widget registry

`apps/desktop/src/features/dashboard/registry.ts`

```ts
interface DashboardWidget {
  id: string;
  title: string;
  gridClass?: string;      // tailwind span classes
  permissions: string[];   // any-of
  component: ComponentType;
}
```

Widget implementations live in `features/dashboard/widgets.tsx`. Adding a
widget = create the component + register it with its permissions.

## Current widgets

| Widget                  | Permission(s)                                  |
| ----------------------- | ---------------------------------------------- |
| Quick actions           | `dashboard.quick-action.execute`               |
| My tasks                | `collaboration.task.view`                      |
| My attendance           | `hrms.attendance.view` (+ check-in/out gates)  |
| My leave                | `hrms.leave.view` (+ `hrms.leave.apply` CTA)   |
| Upcoming meetings       | `collaboration.meeting.view`                   |
| Recent conversations    | `collaboration.message.view`                   |
| Recent projects         | `collaboration.project.view`                   |
| People overview         | `hrms.analytics.view`                          |
| Pending approvals       | `hrms.leave.approve` / `hrms.attendance.approve` |
| People (directory)      | `hrms.employee.view`                           |
| AI daily brief          | `dashboard.widget.view`                        |
| Notifications           | `dashboard.view`                               |

Interview/recruitment widgets land with Phase 5 once the interview service
exists; they plug into the same registry.

## View gating

`src/lib/view-permissions.ts` maps each `View` to required permissions.
`AppShell` renders `screens/access-denied.tsx` when the active view is not
permitted — this covers direct navigation (command menu, deep links), not just
hidden sidebar entries.

## Navigation

- `app-rail.tsx` — module-level items (Home, Inbox, Messages, Projects,
  Meetings, HRMS, Interview, AI, Search; Administration in the bottom group),
  filtered with `hasAnyPermission`.
- `workspace-sidebar.tsx` — sections (Channels, Direct messages, Projects,
  Meetings, Files) and quick-create actions are permission-gated.

Frontend gating is a UX layer only — the backend enforces the same permissions
via `OrganisationPermissionGuard`/`RequirePermissions` and the shared
`@teamspace-one/authorization` policy engine.
