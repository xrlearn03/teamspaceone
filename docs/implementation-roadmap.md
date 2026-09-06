# Teamspace One — Implementation Roadmap

> Phase 0 deliverable. A phased plan from the current audit through a production-hardened, role-based platform.

## Phase 0 — Repository Audit (COMPLETED)

**Deliverables**
- `docs/architecture-audit.md`
- `docs/current-state.md`
- `docs/technical-decisions.md`
- `docs/implementation-roadmap.md`
- `docs/permission-matrix.md` (created alongside)

**Completion Criteria**
- Repository structure understood.
- Existing architecture, auth, UI, and services documented.
- Reusable components and technical gaps identified.
- No unnecessary replacement planned.

## Phase 1 — Authentication + RBAC

**Goal:** Establish the authorization foundation. No new domain features until this is solid.

### 1.1 Backend schema changes

- Extend `services/organisation/prisma/schema.prisma` with:
  - `Permission` table
  - `RolePermission` table
  - `UserRole` table (multiple roles per membership)
  - `DataScope` table
  - `AuditLog` table
- Add seed migration for system permissions and roles (`super_admin`, `org_admin`, `hr_admin`, `recruiter`, `hiring_manager`, `manager`, `employee`, `interviewer`, `candidate`).

### 1.2 Shared authorization package

- Create `packages/authorization/`:
  - `src/permissions.ts` — canonical permission strings
  - `src/policy-engine.ts` — `can(user, module, resource, action, scope?)`
  - `src/guards.ts` — NestJS `PermissionGuard`
  - `src/react.tsx` — `<PermissionGate permission="...">` and `useCan` hook
  - `src/navigation.ts` — permission-aware navigation helper

### 1.3 Service integration

- Update `services/organisation/src/organisation/organisation.service.ts` to:
  - Seed default roles and permissions
  - Resolve membership permissions + data scopes
  - Expose `/roles`, `/permissions`, `/members/:id/roles`, `/members/:id/scopes` endpoints
- Add `PermissionGuard` to `organisation`, `messaging`, `projects`, `meeting`, `file-storage`, `search`, `ai` controllers.
- Update `api-gateway/src/main.ts` to proxy new `/hrms` and `/interview` routes (even if services do not exist yet).

### 1.4 Frontend integration

- Add `<PermissionGate>` wrappers around existing actions (create channel, create project, delete message, etc.).
- Build `RoleManagementScreen` and `PermissionManagementScreen` for Org Admins.
- Add 403 / access denied page.

### 1.5 Tests

- Unit tests for policy engine.
- Integration tests for role assignment and API authorization.
- E2E: super admin sees all modules; employee sees limited modules.

**Completion Criteria**
- Users can sign in and belong to organisations.
- Roles can be assigned and permissions configured.
- Unauthorized API access returns 403.
- Organisation data remains isolated.
- Navigation hides modules the user cannot access.

## Phase 2 — Role-Based Dashboard

**Goal:** Make the dashboard and navigation dynamic and role-aware.

### 2.1 Dashboard architecture

- Create `apps/desktop/src/features/dashboard/`:
  - `widget-registry.ts` — list of widgets with required permissions
  - `DashboardShell.tsx`
  - Role-specific widget components
- Extend `useUIStore` or add `useDashboardStore` for layout/pinned widgets.

### 2.2 Dynamic sidebar and app rail

- Generate `AppRail` and `WorkspaceSidebar` items from a permission-aware navigation config.
- Add top-level modules: Dashboard, Collaboration, HRMS, Interview, Administration.
- Only show items if the user has the corresponding `*.access` permission.

### 2.3 Dashboard screens

- `EmployeeDashboard`
- `HRAdminDashboard`
- `RecruiterDashboard`
- `HiringManagerDashboard`
- `ManagerDashboard`
- `SuperAdminDashboard`

### 2.4 Quick actions

- Permission-aware quick action bar on home screen.
- Pending approvals, tasks, interviews based on role.

**Completion Criteria**
- Different roles see different dashboards.
- Unauthorized modules are hidden and routes blocked.
- Widgets respect permissions.
- Dashboard is responsive and has loading/empty/error states.

## Phase 3 — Collaboration Foundation

**Goal:** Secure and complete the existing collaboration features.

### 3.1 Permission gates

- Apply `<PermissionGate>` to channel/project creation, deletion, member management.
- Apply `PermissionGuard` to messaging and projects controllers.
- Enforce data scope for channel/project visibility.

### 3.2 Direct messages & threads

- Complete thread reply UI in `components/chat/thread-panel.tsx`.
- Improve DM creation and group conversation UX.

### 3.3 Files in collaboration

- Wire message attachments to `file-storage` presign flow.
- Permission-aware file previews and downloads.

### 3.4 Notifications

- Add collaboration notification types (mention, task assignment, channel invite).
- Mark notifications as read from realtime events.

### 3.5 Calendar integration (foundation)

- Add `calendar_events` schema or events in `hrms-service`.
- Link meeting schedule to calendar.

**Completion Criteria**
- Users can collaborate securely.
- Private channels respect membership.
- Tasks respect project permissions.
- File access is secure.
- Notifications work end-to-end.

## Phase 4 — HRMS Core

**Goal:** Build the core people-management module.

### 4.1 New service

- `services/hrms/` with NestJS, Prisma, Dockerfile, and `docker-compose` entry.
- Gateway route `/hrms/*` → `hrms-service:3013`.

### 4.2 Schema

- `Employee`, `Department`, `Designation`, `EmployeeDocument`, `Attendance`, `LeaveRequest`, `LeaveBalance`, `Holiday`, `PayrollPeriod`, `Payslip`, `EmployeeHistory`.
- Link `Employee` to `OrganisationMembership` via `membershipId`.

### 4.3 API endpoints

- `/hrms/employees`, `/hrms/departments`, `/hrms/designations`
- `/hrms/attendance`, `/hrms/leave`, `/hrms/payroll`
- `/hrms/documents`, `/hrms/org-chart`

### 4.4 Frontend

- `apps/desktop/src/screens/hrms/` with overview, employee directory, profile, departments, designations, attendance, leave, payroll, documents.
- Organization chart component.

### 4.5 Permissions & scope

- `hrms.access`, `hrms.employee.view` (own/team/department/organisation), `hrms.employee.create`, etc.
- Payroll endpoints restricted to `hrms.payroll.view` / `hrms.payroll.manage`.
- Employees see only their own payslips.

### 4.6 Leave workflow

- Employee applies → Manager reviews → HR reviews → Approved/Rejected.
- Balance updated, calendar event created, notification sent.

### 4.7 Attendance workflow

- Check-in/check-out, attendance history, correction requests.
- Manager and HR approval flows.

**Completion Criteria**
- Employees can view their own records.
- Managers can view permitted team data.
- HR admins can manage HR data.
- Payroll is restricted.
- Leave and attendance workflows work.

## Phase 5 — Recruitment + AI Interview Foundation

**Goal:** Build the foundation for job openings, candidates, and interviews.

### 5.1 New service

- `services/interview/` with NestJS, Prisma, Dockerfile, and `docker-compose` entry.
- Gateway route `/interview/*` → `interview-service:3014`.

### 5.2 Schema

- `JobOpening`, `Candidate`, `CandidateApplication`, `CandidateDocument`
- `InterviewTemplate`, `InterviewQuestion`, `InterviewSession`, `InterviewParticipant`
- `InterviewEvaluation`, `InterviewFeedback`, `InterviewRecommendation`, `HiringDecision`

### 5.3 API endpoints

- `/interview/jobs`, `/interview/candidates`, `/interview/sessions`
- `/interview/templates`, `/interview/evaluations`, `/interview/decisions`

### 5.4 Frontend

- `apps/desktop/src/screens/interview/` with overview, job openings, candidates, pipeline, sessions, calendar, evaluations, decisions.
- Candidate portal in `apps/web` under `/candidate/*`.

### 5.5 Pipeline

- `Applied → Screening → Shortlisted → Interview → Evaluation → Offer → Hired/Rejected`
- Stage transitions with permission checks.

### 5.6 Permissions

- `interview.access`, `interview.job.view/create`, `interview.candidate.view` (assigned/organisation), `interview.interview.schedule/conduct/evaluate/approve`.
- Interviewers see only assigned interviews.
- Hiring managers see assigned jobs and candidates.
- Recruiters manage assigned candidates.

**Completion Criteria**
- Recruiters can manage assigned candidates.
- Hiring managers can access assigned jobs.
- Interviewers can access assigned interviews.
- Candidates can access their portal.
- Hiring decisions are auditable.

## Phase 6 — AI Screening + AI Interview

**Goal:** Add AI assistance for screening and interviews with human review.

### 6.1 AI service extensions

- `services/ai/src/interview/`:
  - `resume-parser.ts`
  - `job-matcher.ts`
  - `screening-summary.ts`
  - `text-interview.ts`
  - `evaluation-assistant.ts`
- Structured outputs (JSON schemas) with confidence scores.

### 6.2 Resume processing

- Upload resume via `file-storage`.
- Parse skills, experience, education, contact info.
- Match against `JobOpening` requirements.
- Store `AiScreeningResult` with explainable summary.

### 6.3 Text-based AI interviews

- Configure template, questions, duration, difficulty.
- Candidate portal runs a text interview session.
- Transcript stored in `interview_session`.
- AI evaluation summary with human review step.

### 6.4 Human review

- AI recommendations marked as `suggested`.
- Recruiter/hiring manager confirms/declines.
- Editable evaluation scores and comments.
- Audit log of all AI outputs and edits.

### 6.5 Safety

- No protected-characteristic inference.
- No automated final hiring decision.
- AI outputs labeled and explainable.

**Completion Criteria**
- AI results are structured and explainable.
- Human review is required for decisions.
- Sensitive data is protected.
- AI provider secrets remain server-side.
- AI audit logs are queryable.

## Phase 7 — Advanced HRMS

**Goal:** Complete the employee lifecycle and analytics.

### 7.1 Onboarding

- Onboarding templates and checklists.
- Task assignment on hire.
- Document collection.
- Collaboration access provisioning (channel/workspace invites).

### 7.2 Offboarding

- Resignation flow.
- Exit checklist and asset return.
- Access revocation event.
- Final settlement foundation.

### 7.3 Performance

- Performance review cycles, goals, feedback.
- Manager and self-reviews.

### 7.4 Payroll

- Salary structure, earnings/deductions, tax configuration.
- Payslip generation and processing.
- Payroll approval workflow.
- Strict permission checks and audit logs.

### 7.5 HR analytics

- Headcount, turnover, leave, attendance dashboards.
- Permission-aware data aggregation.

### 7.6 Workflows

- Event-driven automation: hire → onboarding tasks, leave approval → calendar update, termination → access revocation.

**Completion Criteria**
- Employee lifecycle workflows work end-to-end.
- Access is automatically provisioned and revoked.
- HR analytics respect permissions.
- Automation is auditable.

## Phase 8 — Production Hardening

**Goal:** Make the platform production-ready.

### 8.1 Security review

- Re-audit all endpoints for permission/data scope enforcement.
- Pen-test checklist: no sensitive data in search, notifications, logs.
- File download authorization audit.
- API key and secret rotation.

### 8.2 Testing

- Unit tests for policy engine, scope checks, validation.
- Integration tests for auth, org isolation, employee/candidate access.
- E2E tests for the required scenarios in the master prompt.

### 8.3 Performance

- Database index review.
- Query optimization in `search-service` and `ai-service`.
- Redis caching for permissions and user profiles.
- Rate limiting and resource quotas.

### 8.4 Observability

- Complete OpenTelemetry traces and metrics.
- Structured logging with correlation IDs.
- Alerting rules and health checks.

### 8.5 Deployment

- Production `docker-compose` / Kubernetes manifests.
- Migration runbooks.
- Backup and restore procedures.
- Environment hardening checklist.

### 8.6 Documentation

- `docs/database-schema.md`
- `docs/authorization.md`
- `docs/dashboard-architecture.md`
- `docs/collaboration.md`
- `docs/hrms.md`
- `docs/ai-interview.md`
- `docs/api.md`
- `docs/security.md`
- `docs/testing.md`

**Completion Criteria**
- Application builds successfully.
- Tests pass.
- Authorization is verified.
- Sensitive data is protected.
- Production configuration is documented.

## Dependency Chain

```text
Phase 0 (Audit)
    │
    ▼
Phase 1 (Auth + RBAC)
    │
    ├──► Phase 2 (Role-Based Dashboard)
    │
    ├──► Phase 3 (Collaboration Foundation)
    │
    ├──► Phase 4 (HRMS Core)
    │         │
    │         └──► Phase 7 (Advanced HRMS)
    │
    └──► Phase 5 (Recruitment + AI Interview Foundation)
              │
              └──► Phase 6 (AI Screening + AI Interview)
                            │
                            └──► Phase 8 (Production Hardening)
```

## Immediate Next Steps (Start of Phase 1)

1. Create `packages/authorization` with permission constants, policy engine, guards, and React hooks.
2. Extend `services/organisation/prisma/schema.prisma` with `Permission`, `RolePermission`, `UserRole`, `DataScope`, `AuditLog`.
3. Write and apply the organisation schema migration and seed data.
4. Update `organisation.service.ts` to expose roles, permissions, and membership-scoped access.
5. Add `PermissionGuard` to existing service controllers and protect at least one endpoint per service.
6. Build `<PermissionGate>` and `useCan` in the frontend.
7. Add a 403 screen and permission-aware navigation.
8. Write unit/integration tests for the policy engine and at least one protected API flow.
9. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` until clean.
10. Document the permission model in `docs/permission-matrix.md` and update `AGENTS.md` with commands.
