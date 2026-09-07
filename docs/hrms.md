# HRMS Module

> Phase 4 deliverable. Core people-management: employees, departments, designations, org chart, attendance, leave, documents, payroll foundation.

## Service

- `services/hrms` — `@teamspace-one/hrms-service`, NestJS + Prisma, port `3013`, database `hrms_db`.
- Gateway: `/hrms/*` → `HRMS_SERVICE_URL` (default `http://localhost:3013`), JWT-verified at the gateway.
- Local dev: `pnpm dev:hrms` · Build: `pnpm build:hrms`.
- Local migration: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hrms_db?schema=public pnpm --filter @teamspace-one/hrms-service db:migrate`
- Docker: `hrms-service` in `docker-compose.yml`; `hrms_db` created by `docker/postgres-init/00-create-databases.sql`; `prisma migrate deploy` runs in the Dockerfile CMD.

## Authorization model

- `src/hrms/authorization.client.ts` resolves the caller's `{permissions, dataScopes}` from the organisation service via `GET /organisations/:id/me/context` (internal API key + `x-actor-id` propagation, 30s cache).
- `src/hrms/permission.guard.ts` — `HrmsPermissionGuard` + `@RequirePermissions(...)`; sets `req.user` (available via `@CurrentUser()`).
- `src/hrms/scope.service.ts` translates `hrms`/`'*'` data scopes into Prisma filters:
  - `organisation` → all employees
  - `department` → actor's department (or `scopeValue`)
  - `team` → direct reports + self
  - `own`/none → actor's own `Employee` record (matched by `userId`)
- `salary` is stripped from employee payloads unless the caller holds `hrms.payroll.view`.
- Payslips: `hrms.payroll.view` + own scope → own payslips only; `hrms.payroll.manage` → all.

## Schema (services/hrms/prisma/schema.prisma)

`Department` (self-hierarchy), `Designation`, `Employee` (`@@unique([organisationId, userId])`, self-relation `managerEmployeeId`, `salary Json?`), `EmployeeHistory`, `EmployeeDocument`, `AttendanceRecord` (`@@unique([employeeId, date])`), `AttendanceCorrection`, `LeaveType`, `LeaveBalance` (`@@unique([employeeId, leaveTypeId, year])`), `LeaveRequest`, `Holiday`, `PayrollPeriod`, `Payslip` (`@@unique([employeeId, payrollPeriodId])`), plus `OutboxEvent`/`InboxEvent`.

## Endpoints

| Route | Permission |
| --- | --- |
| `GET/POST /hrms/employees`, `GET /hrms/employees/me`, `GET/PATCH/DELETE /hrms/employees/:id` | `hrms.employee.view` / `create` / `edit` / `delete` (scoped) |
| `GET/POST/PATCH/DELETE /hrms/departments[/:id]` | `hrms.department.*` |
| `GET/POST/PATCH/DELETE /hrms/designations[/:id]` | `hrms.designation.*` |
| `GET /hrms/org-chart` | `hrms.org-chart.view` |
| `GET /hrms/overview` | `hrms.access` (scope-filtered counts) |
| `POST /hrms/attendance/checkin|checkout`, `GET /hrms/attendance` | `hrms.attendance.checkin|checkout|view` |
| `POST /hrms/attendance/corrections`, `POST .../corrections/:id/approve|reject` | own / `hrms.attendance.approve` |
| `GET/POST /hrms/leave/types`, `GET /hrms/leave/balances`, `GET/POST /hrms/leave/requests`, `POST .../requests/:id/approve|reject|cancel` | `hrms.leave.*` |
| `GET/POST /hrms/payroll/periods`, `POST .../periods/:id/process`, `GET /hrms/payroll/payslips[/:id]` | `hrms.payroll.*` |
| `GET/POST/DELETE /hrms/documents[/:id]` | `hrms.document.*` (own-record/uploader rules in service) |
| `GET/POST /hrms/holidays` | view / `hrms.leave.manage` |
| `GET /hrms/calendar`, `POST /hrms/calendar/events` | `hrms.access` |

## Workflows

- **Leave**: apply → `pending` → manager approve (`hrms.leave.approve`) → `manager_approved`; reviewer with `hrms.leave.manage` → `approved`, which increments `LeaveBalance.used` inside a transaction (balance sufficiency checked at apply time). Reject/cancel paths provided.
- **Attendance**: own check-in/check-out upserts the day's record; corrections go `pending` → approved/rejected by `hrms.attendance.approve` (manager of the employee or org scope).
- **Payroll**: `POST /hrms/payroll/periods/:id/process` (`hrms.payroll.process`) moves draft → approved and generates draft payslips for active employees with a `salary` payload. Payroll is the restricted foundation; advanced processing lands in Phase 7. Every single-payslip read emits `teamspace-one.hrms.payroll.payslip.viewed`, which the audit service stores automatically via the `HRMS` stream.
- **Calendar**: `GET /hrms/calendar?from=&to=` returns `{ events, holidays }` — approved leave auto-creates an org-visible `CalendarEvent` (`sourceType=leave-request`), holidays are merged in, and `POST /hrms/calendar/events` creates custom events (`private` unless the caller has `hrms.leave.manage`). Meeting calendar events remain on `GET /meetings/calendar/events`; a unified aggregation layer can merge the two later.
- **Auto-provisioning**: the organisation service consumes `teamspace-one.hrms.employee.created` (`organisation-hrms-provisioning` durable, inbox-deduplicated) and creates a membership with the default `employee` role + role scopes when the user isn't a member yet — employees get collaboration access automatically.
- **Employee lifecycle**: create/update writes `EmployeeHistory` rows; delete is a soft terminate (`status = 'terminated'`).

## Events

Outbox events (subject = event type): `teamspace-one.hrms.employee.created|updated|terminated`, `leave.requested|approved|rejected`, `attendance.correction.requested|resolved`, `payroll.period.processed`, `document.uploaded`. They publish to the `HRMS` JetStream stream (`packages/event-contracts/src/streams.ts`); the service's own consumer subscribes `teamspace-one.hrms.>` (durable `hrms-consumer`).

**Notifications**: `notification-service` consumes `teamspace-one.hrms.>` (durable `notification-hrms-consumer`) and creates in-app notifications — leave request → manager, leave approved/rejected → employee, attendance correction requested → manager, resolved → employee, employee created → welcome. Payloads carry `userId`/`managerUserId` so the notification service can target recipients without an HRMS DB lookup.

## Seed data

`SEED_ORGANISATION_ID=<org-id> pnpm --filter @teamspace-one/hrms-service db:seed` seeds leave types, departments, designations, and holidays (idempotent). Optionally `SEED_EMPLOYEES='[{userId, firstName, lastName, department, designation, managerUserId}]'` creates employee records — `userId` must be a real user, so employees are normally created via the API/onboarding instead.

## Frontend

- `apps/desktop/src/screens/hrms/` — tabbed `HrmsScreen`: Overview, Employees (directory + profile + create/edit dialogs), Departments & Designations, Org Chart, Attendance, Leave, Payroll (read-only, gated `hrms.payroll.view`), Documents.
- Sidebar "HRMS" item shows when the user has `hrms.access` or any `hrms.*` permission; `canAccessView` also redirects unauthorized users to the access-denied screen; each tab checks its `hrms.<area>.view` permission.
- API client: `lib/api.ts` (`/hrms/*`), hooks in `hooks/api.ts` (`useEmployees`, `useLeaveRequests`, `useAttendance`, …), permission helpers in `hooks/usePermissions.ts`.

## Registry encoding note

Two-part permissions (`hrms.access`, `dashboard.view`, `collaboration.access`, `interview.access`) are stored in the `permissions` table as `resource='*'`; `permissionParts`/`permissionKey` in `@teamspace-one/authorization` handle the mapping consistently. `permissionMatches` supports trailing-wildcard grants (`hrms.*` covers every `hrms.*` permission, including `hrms.access`).

## Tests

`services/hrms/test/hrms.service.spec.ts` — 12 tests: scope filtering, leave approval + balance, payslip restriction, salary stripping.
