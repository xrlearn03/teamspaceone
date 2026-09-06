# Teamspace One — Technical Decisions

> Phase 0 deliverable. Records the architectural and implementation decisions made for the next phases of the project.

## 1. Monorepo & Tooling

### Decision: Keep the existing pnpm + Turbo monorepo layout

**Rationale:**
- The repository already has working package/service boundaries, a `turbo.json` pipeline, and Docker Compose.
- Rebuilding would destroy existing collaboration features.
- pnpm workspaces let us add shared authorization types, UI, and API clients without duplicating code.

**Implications:**
- New services will be added under `services/hrms` and `services/interview`.
- New shared packages will be added under `packages/authorization` and expanded `packages/types` / `packages/ui`.
- The marketing web app will remain `apps/web`; the desktop app remains `apps/desktop`.

## 2. Frontend Stack

### Decision: Continue with React 19 + TypeScript + Tailwind CSS v4 + Radix UI

**Rationale:**
- The design system is already CSS-variable driven and uses Radix primitives.
- Existing screens are written in this stack.
- Tailwind v4’s `@theme` / `@custom-variant` approach is already in use.

**Implications:**
- No second frontend framework will be introduced.
- New module screens will be added under `apps/desktop/src/screens/` and composed with existing UI primitives.

## 3. Frontend Routing

### Decision: Add `react-router-dom` v6 for module sub-routes while keeping the `AppShell` view state for top-level modules

**Rationale:**
- The current `activeView` enum is sufficient for top-level app sections (`home`, `channel`, `project`, etc.).
- HRMS and AI Interview have many sub-screens (employees, departments, job openings, candidates, evaluations) that benefit from URL-based routing, deep links, and back/forward navigation.

**Implications:**
- `AppShell` will still derive the top-level `activeView` from `useUIStore`.
- Inside the main content area, module screens may render `<Routes>` for sub-navigation.
- Permission guards will be implemented as route wrappers (`<ProtectedRoute>`) and component gates (`<PermissionGate>`).
- `apps/web` will also use `react-router-dom` for marketing + candidate portal routes.

## 4. State Management

### Decision: Keep Zustand for local UI state and TanStack Query for server state

**Rationale:**
- The desktop app already relies on both.
- Zustand is appropriate for theme, panels, active view.
- TanStack Query is appropriate for caching, invalidation, and background refetching.

**Implications:**
- Permission state (user roles, permissions, active organisation) will be fetched with TanStack Query and cached.
- `useUIStore` may gain a small amount of module sub-view state if needed.

## 5. Backend Framework

### Decision: Keep NestJS + Prisma + PostgreSQL for all new services

**Rationale:**
- All existing services use NestJS with Prisma.
- The `OrganisationContextMiddleware` and Outbox pattern are reusable.
- PostgreSQL with pgvector supports both relational data and vector search.

**Implications:**
- `services/hrms` and `services/interview` will each have their own Prisma schema and generated client.
- Shared DTOs and types will live in `packages/types` and `packages/validation`.

## 6. Service Boundaries

### Decision: Add dedicated `hrms-service` and `interview-service` rather than extending `projects` or `organisation`

**Rationale:**
- HRMS and Interview are distinct bounded contexts with different data ownership, access rules, and lifecycle events.
- Keeping them separate avoids bloating `organisation` or `projects` and makes migrations easier.
- Event-driven integration lets them communicate without direct coupling.

**Implications:**
- New gateway routes: `/hrms/*` → `hrms-service`, `/interview/*` → `interview-service`.
- New subjects in `packages/event-contracts/src/subjects.ts` for HR/Interview lifecycle.
- `api-gateway/src/main.ts` will proxy the new routes.

## 7. Authorization Architecture

### Decision: Extend the existing `User` → `OrganisationMembership` → `Role` model with a granular permission system

**Rationale:**
- The existing schema already has `Role` with `permissions` JSON; we can migrate it to a normalized model.
- The product requires a permission matrix, not just role names.

**Implementation:**
- New tables in `services/organisation/prisma/schema.prisma`:
  - `Permission` (module, resource, action)
  - `RolePermission`
  - `UserRole` (allow multiple roles per membership)
  - `DataScope` (scope_type, scope_value)
  - `AuditLog`
- A new shared package `@teamspace-one/authorization` containing:
  - `permissions.ts` — canonical permission constants
  - `policy-engine.ts` — `can(user, module, resource, action, scope?)`
  - `guards.ts` — NestJS `PermissionGuard`
  - `react.tsx` — `<PermissionGate>` component and `useCan` hook
- Service methods will call the policy engine rather than hardcoding role checks.

## 8. Data Scopes

### Decision: Implement scopes as a dedicated `DataScope` table and helper functions

**Rationale:**
- Scopes are not permissions by themselves; they constrain how a permission applies.
- A separate table supports `own`, `team`, `department`, `assigned`, and `organisation` scopes.

**Implementation:**
- `data_scopes` rows reference `organisation_membership_id`, `module`, `scope_type`, and optional `scope_value`.
- Policy engine evaluates the permission **and** the scope before allowing access.
- Examples:
  - `hrms.employee.view` + `team` → manager can view direct reports
  - `interview.candidate.view` + `assigned` → recruiter can view assigned candidates

## 9. Employee & Candidate Identity

### Decision: Separate `Employee` and `Candidate` from `User`

**Rationale:**
- A user account is not the same as an employee record or a candidate record.
- A person can be a candidate, then an employee, and belong to multiple organisations.

**Implementation:**
- `User` remains in `auth-service`.
- `Employee` lives in `hrms-service` and is linked to an `OrganisationMembership`.
- `Candidate` lives in `interview-service` and may optionally link to a `User` for portal access.
- Hiring an employee publishes an event that `hrms-service` consumes to create an `Employee` and `OrganisationMembership`.

## 10. AI Architecture

### Decision: Continue using the `services/ai` abstraction layer and add interview-specific flows

**Rationale:**
- The service already has provider abstraction, prompt handling, embeddings, and human-in-the-loop confirmations.
- Reusing it keeps AI provider secrets out of the frontend and centralizes auditability.

**Implementation:**
- Add `services/ai/src/interview/` subfolder for resume parsing, job matching, text interviews, evaluation.
- Add `interview_templates` and `interview_questions` to the `ai` schema or `interview` schema depending on ownership.
- AI outputs are labeled, editable, and require human confirmation before affecting hiring decisions.

## 11. Search

### Decision: Extend the existing `search-service` with HRMS and Interview document extractors

**Rationale:**
- The current full-text + permission model already handles messages, tasks, files, meetings, etc.
- Adding new extractors is low-risk and keeps search permission-aware.

**Implementation:**
- Add cases in `search.service.ts` for `employee`, `department`, `candidate`, `job_opening`, `interview_session`.
- Add the same resource types to `SearchSqlBuilder` permission logic.

## 12. Notifications

### Decision: Extend `notification-service` event consumption for HRMS and Interview events

**Rationale:**
- The service already listens to NATS and creates user notifications.
- New subjects can be added without breaking existing flows.

**Implementation:**
- Add handlers for leave approvals, interview schedules, feedback requests, hiring decisions, onboarding tasks.
- Add notification preference defaults per role if needed.

## 13. File Storage

### Decision: Reuse `file-storage-service` with module-aware access checks

**Rationale:**
- Presigned uploads, checksums, previews, and external shares already work.
- HRMS and Interview need document categories (resume, payslip, offer letter, ID proof).

**Implementation:**
- Extend `FileRecord.category` enum or validation.
- Add access checks that combine `organisationId` with permission/data scope.
- Index files by category and resource type in `search-service`.

## 14. Realtime

### Decision: Keep Socket.io rooms and extend `resource_access` for new entity types

**Rationale:**
- The realtime gateway already validates access before joining rooms.
- New HRMS/Interview rooms can reuse the same mechanism.

**Implementation:**
- `hrms-service` and `interview-service` will publish membership events that `realtime-service` consumes.
- New room prefixes: `employee:`, `candidate:`, `interview:`.

## 15. Web App / Candidate Portal

### Decision: Extend `apps/web` to host a public candidate portal alongside the marketing site

**Rationale:**
- Candidates should not need the desktop installer.
- `apps/web` is currently static; adding authenticated routes is acceptable and avoids a third application.

**Implementation:**
- Add `react-router-dom` routes for `/`, `/download`, `/candidate/login`, `/candidate/apply`, `/candidate/interview`.
- Candidate portal uses the same `packages/api-client` and `VITE_GATEWAY_URL`.
- Token is stored in `localStorage` (acceptable for web; desktop still uses keychain).

## 16. Testing

### Decision: Introduce unit, integration, and e2e tests incrementally as each phase is delivered

**Rationale:**
- There are currently no automated tests beyond a k6 smoke test.
- Adding tests after each phase prevents regression and verifies authorization behavior.

**Implementation:**
- Backend: Jest/Vitest in each service for policy engine and service logic.
- Frontend: Vitest for permission hooks/components.
- E2E: Playwright for role-based flows (super admin vs employee vs candidate).

## 17. Package vs Service Responsibilities

| Concern | Package/Service | Notes |
| --- | --- | --- |
| Permission definitions | `packages/authorization/src/permissions.ts` | Single source of truth |
| Permission check (backend) | `packages/authorization/src/policy-engine.ts` | Used by guards and services |
| Permission check (frontend) | `packages/authorization/src/react.tsx` | `<PermissionGate>`, `useCan` |
| HTTP API gateway | `services/api-gateway` | Adds routes, no business logic |
| User/Auth | `services/auth` | Keeps user accounts |
| Org/Roles/Membership | `services/organisation` | Adds Permission/RolePermission/UserRole/DataScope |
| HRMS domain | `services/hrms` | Employee, department, leave, attendance, payroll |
| Interview domain | `services/interview` | Job, candidate, interview, evaluation, decision |
| AI logic | `services/ai` | Reused across collaboration and interview |
| Search index | `services/search` | Permission-aware search across all domains |
| Notifications | `services/notification` | Cross-domain notifications |
| Audit | `services/audit` | Security and business audit events |

## 18. Decisions Log

| # | Decision | Alternatives Rejected | Status |
| --- | --- | --- | --- |
| 1 | Keep pnpm/Turbo monorepo | Split into separate repos | Accepted |
| 2 | React 19 + Tailwind v4 + Radix | Next.js, Vue, separate design tool | Accepted |
| 3 | Add `react-router-dom` for sub-routes | Keep only Zustand view state | Accepted |
| 4 | Keep NestJS + Prisma + Postgres | Adopt Django/Rails | Accepted |
| 5 | Separate `hrms-service` and `interview-service` | Extend `organisation`/`projects` | Accepted |
| 6 | Extend existing role model to granular RBAC | Replace auth entirely | Accepted |
| 7 | `DataScope` as separate table | Encode scope in permission string | Accepted |
| 8 | `Employee`/`Candidate` separate from `User` | Reuse `User` with flags | Accepted |
| 9 | Reuse `services/ai` for interview intelligence | Build separate AI service | Accepted |
| 10 | Extend `apps/web` for candidate portal | Build `apps/candidate` | Accepted |
| 11 | Add tests incrementally | Write all tests at the end | Accepted |
