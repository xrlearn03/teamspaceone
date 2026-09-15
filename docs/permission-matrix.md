# Teamspace One — Permission Matrix

> Initial baseline for role-based access control. This matrix is the starting point for the granular permission system implemented in Phase 1.

## Legend

| Symbol | Meaning |
| --- | --- |
| **A** | Admin / Full access |
| **M** | Manage (create, edit, delete within scope) |
| **V** | View |
| **O** | Own / Assigned only |
| **T** | Team / Department scope |
| **-** | No access |

## Module Matrix

| Module / Feature | Super Admin | Org Admin | HR Admin | Recruiter | Hiring Manager | Manager | Employee | Interviewer | Candidate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Dashboard** | A | A | A | A | A | A | A | A | O |
| **Collaboration** | A | A | M | O | O | M | O | O | - |
| **HRMS** | A | A | A | O | O | T | O | O | - |
| Employee Management | A | A | A | O | O | T | O | O | - |
| Attendance | A | A | M | O | O | T | O | O | - |
| Leave | A | A | A | O | O | T | O | O | - |
| Payroll | A | A | A | O* | O* | O* | O* | O* | - |
| Recruitment | A | A | A | A | Limited | - | - | - | O |
| Onboarding | A | A | A/M | O | O | T | O | O | - |
| Offboarding | A | A | A/M | - | - | T | O | - | - |
| Performance | A | A | A/M | O | O | T | O | O | - |
| HR Analytics | A | A | V | - | Limited | T | - | - | - |
| AI Interview | A | A | M | M | M | - | - | M | O |
| Candidate Management | A | A | M | M | Assigned | - | - | Assigned | O |
| Interview Scheduling | A | A | M | M | M | - | - | Assigned | O |
| Interview Evaluation | A | A | M | M | M | - | - | Assigned | O |
| Role Management | A | A | - | - | - | - | - | - | - |
| Permission Management | A | A | - | - | - | - | - | - | - |
| Organization Settings | A | A | Limited | - | - | - | - | - | - |

*Payroll: Employee sees **only their own** payslips, never administration.

## Granular Permission Strings

Permissions are namespaced as `module.resource.action`.

### Dashboard

```text
dashboard.view
dashboard.widget.view
dashboard.quick-action.execute
```

### Collaboration

```text
collaboration.access
collaboration.workspace.view
collaboration.workspace.create
collaboration.workspace.manage
collaboration.workspace.delete
collaboration.team.view
collaboration.team.create
collaboration.team.manage
collaboration.team.delete
collaboration.channel.view
collaboration.channel.create
collaboration.channel.manage
collaboration.channel.delete
collaboration.message.view
collaboration.message.send
collaboration.message.edit
collaboration.message.delete
collaboration.file.view
collaboration.file.upload
collaboration.file.delete
collaboration.project.view
collaboration.project.create
collaboration.project.manage
collaboration.project.delete
collaboration.task.view
collaboration.task.create
collaboration.task.assign
collaboration.task.edit
collaboration.task.delete
collaboration.meeting.view
collaboration.meeting.create
collaboration.meeting.conduct
collaboration.meeting.delete
```

### HRMS

```text
hrms.access
hrms.employee.view
hrms.employee.create
hrms.employee.edit
hrms.employee.delete
hrms.employee.export
hrms.department.view
hrms.department.create
hrms.department.edit
hrms.department.delete
hrms.designation.view
hrms.designation.create
hrms.designation.edit
hrms.designation.delete
hrms.org-chart.view
hrms.attendance.view
hrms.attendance.checkin
hrms.attendance.checkout
hrms.attendance.manage
hrms.attendance.approve
hrms.leave.view
hrms.leave.apply
hrms.leave.approve
hrms.leave.reject
hrms.leave.manage
hrms.payroll.view
hrms.payroll.manage
hrms.payroll.process
hrms.payroll.export
hrms.document.view
hrms.document.upload
hrms.document.delete
hrms.recruitment.view
hrms.onboarding.view
hrms.onboarding.manage
hrms.offboarding.view
hrms.offboarding.manage
hrms.performance.view
hrms.performance.manage
hrms.analytics.view
hrms.analytics.export
```

### AI Interview / Recruitment

```text
interview.access
interview.job.view
interview.job.create
interview.job.edit
interview.job.delete
interview.candidate.view
interview.candidate.create
interview.candidate.edit
interview.candidate.delete
interview.candidate.export
interview.screening.view
interview.screening.run
interview.template.view
interview.template.create
interview.template.edit
interview.template.delete
interview.interview.view
interview.interview.schedule
interview.interview.conduct
interview.interview.evaluate
interview.interview.edit-evaluation
interview.interview.approve
interview.decision.view
interview.decision.make
interview.analytics.view
```

### Administration

```text
admin.user.manage
admin.role.manage
admin.permission.manage
admin.audit.view
admin.organization.settings
admin.organization.billing
admin.system.settings
```

## Data Scopes

The matrix above is interpreted by combining each permission with a **data scope**.

| Scope | Description |
| --- | --- |
| `own` | The user’s own records only. |
| `assigned` | Records explicitly assigned to the user (e.g., candidates, interviews). |
| `team` | Records of the user’s direct reports / team members. |
| `department` | Records within the user’s department. |
| `organisation` | All records within the active organisation. |

### Examples

| Role | Permission | Scope | Result |
| --- | --- | --- | --- |
| Employee | `hrms.employee.view` | `own` | Can view their own employee profile. |
| Manager | `hrms.employee.view` | `team` | Can view profiles of direct reports. |
| HR Admin | `hrms.employee.view` | `organisation` | Can view all employees in the org. |
| Recruiter | `interview.candidate.view` | `assigned` | Can view assigned candidates. |
| Hiring Manager | `interview.interview.view` | `assigned` | Can view interviews for their assigned jobs. |
| Interviewer | `interview.interview.conduct` | `assigned` | Can conduct only assigned interviews. |
| Candidate | `interview.interview.view` | `own` | Can view their own interview schedule. |

## Implementation Notes

- The actual system uses granular permissions, not just role names.
- A user may have multiple roles and multiple data scopes.
- `Super Admin` bypasses organisation checks but still leaves an audit trail.
- `Org Admin` has full access within the organisation.
- `HR Admin` does **not** automatically get `admin.role.manage` or `admin.permission.manage`.
- `Manager` scope is `team` or `department` depending on the permission.
- `Employee` and `Candidate` are scoped to `own` or `assigned` only.
- Every internal staff role shares a common baseline (`STAFF_BASELINE_ALLOW` in `authorization.service.ts`): channels, messages/DMs, meetings, files, projects/tasks, tickets, and self-service HRMS. Roles without an `hrms` data scope resolve to `own`, so self-service records stay limited to the member's own employee record.
- `Payroll` is highly restricted: only Admin/HR Admin roles with `hrms.payroll.manage` can administer payroll; employees see only their own payslips via `hrms.payroll.view` + `own` scope.

## Enforcement Layers

This matrix must be enforced at every layer:

1. **Frontend routes** — `ProtectedRoute` checks authentication, organisation, and permission.
2. **Frontend components** — `<PermissionGate>` hides actions the user cannot perform.
3. **API Gateway** — JWT verification and header stripping.
4. **Service controllers** — `PermissionGuard` and `DataScope` checks.
5. **Service methods** — Policy engine validates before executing business logic.
6. **Database queries** — Queries filter by `organisationId` and scope.
7. **File access** — `file-storage-service` validates permission and scope.
8. **Search** — `search-service` filters results by permission JSON and actor scope.
9. **Realtime** — `realtime-service` checks `resource_access` before joining rooms.
10. **Background jobs** — AI processing, notifications, and audit consumers respect scope.
11. **Export functionality** — Permission-controlled and audited.
