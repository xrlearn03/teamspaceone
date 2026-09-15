# Teamspace One — Agent Notes

## Project

- Monorepo with pnpm workspaces.
- Root: `/Volumes/SSD/MVP`.
- `apps/desktop/` is the Tauri 2 + React + TypeScript + Tailwind CSS v4 desktop app.
- `apps/web/` is the marketing/landing website (Vite + React + TS + Tailwind v4). Dev: `pnpm dev:web`, build: `pnpm build:web`. Installer downloads live in `apps/web/public/downloads/`; the Windows `.exe` still needs to be built on Windows/CI and placed there.

## Security model (added in audit remediation)

- Required env vars (no insecure defaults): `JWT_SECRET`, `INTERNAL_API_KEY`, `SFU_TOKEN_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `NATS_USER`/`NATS_PASSWORD`, `S3_ACCESS_KEY`/`S3_SECRET_KEY`. See root `.env.example`.
- All service HTTP requests require `x-internal-api-key` (enforced by `OrganisationContextMiddleware` from `@teamspace-one/organisation-context`); `/health` and `/socket.io` are exempt. The API gateway attaches the key when proxying and sets `x-actor-id` from the verified JWT — clients cannot spoof identity headers (stripped inbound).
- Service-to-service HTTP calls must send `x-internal-api-key` + `x-internal-caller: <service-name>` and propagate `x-actor-id`/`x-organisation-id` when acting for a user.
- The SFU (`services/sfu`, Rust) is the only media path (LiveKit removed). It requires an HMAC token in `Join`: clients call `POST /meetings/:id/sfu-token` (issued by meeting-service after participant check) and pass it in the join message. Media runs over UDP via `SFU_UDP_MUX_PORT` (single muxed port) and `SFU_NAT_1TO1_IPS` advertises public IPs behind NAT.
- SFU recording: internal control API on `SFU_CONTROL_PORT` (default 8445, not published) — meeting-service `setRecording` calls `POST /rooms/:id/recording/start|stop` with an HMAC `x-sfu-control-token`. Per-track files (`.ogg`/`.ivf`/`.h264`) land in `SFU_RECORDING_DIR` and are uploaded to file-storage as the recorder's uploads on stop or when the room drains — each upload carries `metadata.speaker` (publisher's display name) for transcript labeling. Needs `FILE_STORAGE_SERVICE_URL` + `INTERNAL_API_KEY` on the SFU.
- Meeting MOM transcription has two paths. (a) Live: `POST /ai/scribe-token` mints a single-use ElevenLabs realtime token; `useLiveTranscription` (desktop + desktop-next, mounted in `native-conference.tsx`) streams the local mic as PCM16/16kHz to the Scribe realtime WS and POSTs committed segments to `POST /meetings/:id/transcript-lines` (`meeting_transcript_lines` table, participants only, `collaboration.meeting.conduct`). `end()` merges those lines with chat into `MEETING_ENDED.transcript` — works even when recording is off. (b) Batch fallback for recorded calls: `MEETING_ENDED` carries `wasRecording`; the `summarize` job is delayed `MEETING_SUMMARY_DELAY_MS` (default 60s, 4 attempts) so SFU uploads can land, then `meetingAudioTranscript` (services/ai/src/ai/ai.service.ts) lists `GET /files?resourceType=meeting&resourceId=<meetingId>` as the meeting creator, transcribes each `audio/*` file via `ElevenLabsTranscriber` (batch `POST /v1/speech-to-text`, `ELEVENLABS_API_KEY`/`ELEVENLABS_STT_MODEL`, disabled when unset), merges per-speaker utterances by timestamp, and folds it into the MOM prompt + `ai_documents` text. Chat-only MOM remains the last fallback.
- CORS: gateway + realtime use `CORS_ORIGINS` (comma-separated); defaults cover Tauri/Vite dev origins.
- Scheduled meetings: `POST /meetings` accepts `scheduledAt` + `inviteeIds` (stored as `meeting_invitees` rows; invitees see the meeting in `GET /meetings`, calendar events, and can join). `MeetingScheduler` in `services/meeting/src/meeting/meeting.scheduler.ts` sweeps every `MEETING_SWEEP_INTERVAL_MS` (default 30s): emits `MEETING_REMINDER` `MEETING_REMINDER_BEFORE_MS` (default 15 min) before `scheduledAt`, then auto-starts the meeting at `scheduledAt` by emitting `MEETING_STARTED` with `attendeeIds` (creator + invitees + participants) so the notification service fans out "join" notifications. The desktop `ScheduledMeetingPrompt` (mounted in all three shells) also surfaces a join card when a scheduled meeting comes due.
- Guest meeting links: `POST /meetings/:id/share-link` (participant/invitee/creator, `collaboration.meeting.view`) returns `{PUBLIC_WEB_URL}/join/<token>` where the token is a stateless HMAC over `base64url(meetingId).exp` signed with `SFU_TOKEN_SECRET` (domain-separated `guest.` prefix — never valid as an SFU media token). Links expire at `scheduledAt + 24h`, or 24h after creation for unscheduled meetings; joining an `ended` meeting is rejected. The gateway proxies `/meetings/public/*` without JWT (mirrors `/interview/public`); `GET /meetings/public/join/:token` returns meeting info and `POST /meetings/public/join/:token` `{name, email}` creates a `meeting_participants` row (`userId = guest:<sha256(email)[:24]>`, `guestName`/`guestEmail` columns, idempotent rejoin) and returns an SFU token for that guest identity. `apps/web` serves the join page at `/join/:token` (name+email → getUserMedia → SFU over WS); nginx exposes `/meetings/public` and `location = /sfu` (WS proxy → `sfu:8443`), and the web dev server proxies the same paths (`vite.config.ts`). Browser SFU URL resolution: `VITE_SFU_URL` else same-origin `/sfu`. The desktop app joins guests too: `teamspace-one://join/<token>` deep links (cold start via the `get_deep_link` command, warm via the `deep-link://new-url` event) and the "Join as guest" link on the auth screen both open `screens/guest-meeting.tsx`, which uses `useSfu.join(..., sfuToken)` — pass a pre-issued token as the 5th arg for guests since they can't call the authed `sfu-token` endpoint. Signed-in users hitting a guest link are redirected into the normal member meeting view when `getMeeting` succeeds.
- Meeting scheduling extras (migration `20260913000000_meeting_scheduling_extras`): meetings carry `durationMinutes`, `recurrence` (`daily|weekly|monthly`), `seriesId` (shared across a recurring series), and a human-friendly `joinCode` (8-char, unique per org). `POST /meetings` accepts `durationMinutes` + `recurrence`; ending a recurring meeting auto-creates the next occurrence (same invitees) unless a future one is already scheduled. `GET /meetings/code/:code` resolves a join code (creator/participant/invitee only, `collaboration.meeting.view`); `GET /meetings/calendar/availability?userIds=&from=&to=` returns busy intervals for smart scheduling.
- Meeting recordings: the SFU uploads recording files via `POST /files/upload` with `resourceType=meeting` + `resourceId=<meetingId>` multipart fields — files are bound to the meeting resource, so access is ACL'd through `GET /meetings/:id/access` (attendees only) and they are hidden from the global `GET /files` list. `GET /files?resourceType=meeting[&resourceId=<meetingId>]` lists recordings the caller can reach.
- `POST /files/upload` accepts `resourceType`/`resourceId` multipart fields to bind uploads to an ACL'd resource (checked via `RESOURCE_ACCESS_CHECKS` — the uploader must pass the owning service's access check).
- Time entries live in the projects service (`services/projects/src/projects/time-entries.controller.ts` + `time-entries.service.ts`, `time_entries` table, migration `20260913040000_time_entries`): `GET /time-entries?from&to`, `POST /time-entries`, `PATCH/DELETE /time-entries/:id` — owner-scoped (`userId = x-actor-id`), same pattern as personal todos (RemotePermissionGuard, no `@RequirePermissions`). Entries may link to `projectId`/`taskId` (validated org-owned; task implies its project) or carry a free-form `label`; `minutes` + `billable` drive the grid/stats. The gateway proxies `/time-entries` to the projects service. Desktop: `screens/my-timesheet.tsx` (`my-timesheet` view, gated on `collaboration.access`, sidebar "My Timesheet") uses `useTimeEntries`/`useCreateTimeEntry`/`useUpdateTimeEntry`/`useDeleteTimeEntry`.
- Personal todos live in the projects service (`services/projects/src/projects/todos.controller.ts` + `todos.service.ts`, `personal_todos` table, migration `20260913020000_personal_todos`): `GET/POST /todos`, `PATCH/DELETE /todos/:id` — owner-scoped (`userId = x-actor-id`), no `@RequirePermissions` (any org member manages their own). The gateway proxies `/todos` to the projects service. Desktop: `getTodos`/`createTodo`/`updateTodo`/`deleteTodo` in `lib/api.ts` and `useTodos`/`useCreateTodo`/`useUpdateTodo`/`useDeleteTodo` in `hooks/api.ts` power the Todo card on the HR dashboard (`screens/hr/dashboard.tsx`).
- Direct calls to a service port in local dev need the `x-internal-api-key` header (value = `INTERNAL_API_KEY`).
- Member invite flow: `POST /organisations/:id/members/invite` (`admin.user.manage`, email + roleId + optional names) → org service calls auth `POST /auth/internal/provision` (internal key + `x-internal-caller` only; the gateway strips `x-internal-caller` from clients so it can't be reached externally) → user created with a generated temp password and `mustChangePassword` → membership + `MEMBER_INVITED` event → notification service emails credentials. Invited users are forced through a set-new-password screen on first login. Employee/candidate category roles are rejected (they onboard via HR/recruitment workflows). Needs `AUTH_SERVICE_URL` on the organisation service.
- Employee invite flow (HR-driven, for employees without a login): `POST /hrms/employees/:id/invite` (`hrms.employee.edit`, optional `email` override — defaults to `workEmail`/`personalEmail`) → HRMS calls auth `POST /auth/internal/provision` via `AuthAccountsClientService` (rotates the temp password when the account exists but is unactivated), links `employee.userId`, and emits `hrms.employee.invited` (Subjects.HRMS_EMPLOYEE_INVITED) → the organisation service `HrmsProvisioningConsumer` (durable `organisation-hrms-employee-invite`) grants the default employee membership, records a pending `invitation` row (resend/revoke work like member invites), and emits `MEMBER_INVITED` → notification service emails the same credentials email. Desktop: "Invite" item in the HR Employees grid card menu (`screens/hr/employees.tsx`, both apps) shown when `hrms.employee.edit` + `employee.userId` is null. The grid also merges in internal org members without an employee record as "No profile" draft cards (same draft concept as `screens/hrms/employees.tsx` `EmployeesSection`) — clicking one opens `EmployeeFormDialog` in draft mode, which creates the employee linked via `userId` + `membershipId`.
- Internal support tickets live in the organisation service (`services/organisation/src/tickets/`, `tickets` table, migration `20260913000000_tickets`): `POST/GET /organisations/:id/tickets`, `PATCH /organisations/:id/tickets/:ticketId` (status, assignee-role members or org owner only). Permissions: `collaboration.ticket.create` (POST), `collaboration.ticket.view` (GET; the `tickets` view is gated on it), `collaboration.ticket.manage` (PATCH) — granted to all internal staff templates; `manage` additionally requires assignee-role membership enforced in the service. `assigneeRoleId` must be a role named `owner`/`org_admin`/`hr_admin`/`hr_manager` (`TICKET_ASSIGNEE_ROLE_NAMES`). Create emits `TICKET_CREATED` (new `TICKETS` JetStream stream, `teamspace-one.ticket.>`) with `recipientIds` = members holding the assignee role → notification service fans out; status changes emit `TICKET_STATUS_CHANGED` to the requester. `GET` returns the caller's own tickets plus tickets assigned to roles they hold (org owner sees all). Desktop: Help → Tickets tab raises tickets (attachments upload via `uploadFile` first, stored as `{fileId,name,size,mimeType}` JSON — rendered as download chips via `downloadFile`); the `tickets` view (`screens/tickets.tsx`) is the assignee workspace and deep-links back via `helpTab` in `stores/ui.ts`. `GET /organisations/:id/me/context` now returns `roleIds` (primary + extra roles) which the tickets UI uses to detect assignee membership.
- All outbound emails prefer organisation SMTP. Organisation-scoped events resolve directly by organisation ID; account-level events such as password-reset OTP resolve the user's oldest membership with an enabled provider (then oldest owned organisation), with platform SMTP/webhook as fallback when no organisation provider exists.
- Audit feed: the audit service consumes every JetStream stream and stores envelopes in `audit_events` (`services/audit`). The gateway proxies `/audit` → `AUDIT_SERVICE_URL` (default `http://localhost:3007`); `GET /audit/events?take=` requires `admin.audit.view` (RemotePermissionGuard → org service `/me/context`, needs `ORGANISATION_SERVICE_URL` + `INTERNAL_API_KEY` on the audit service). The admin home dashboard (`apps/desktop-next/src/screens/home-admin.tsx`, rendered by `screens/home.tsx` when `useShellVariant()` returns `admin`) reads it via `useAuditEvents`.
- Recruiter/interviewer home dashboard: `screens/home-recruiter.tsx` (both desktop apps) renders from `screens/home.tsx` when `useIsRecruitingRole()` matches (role name `recruiter`/`hiring_manager`/`interviewer`, or any `interview.*` permission on a non-candidate/guest/external member — checked after the admin/hr shell variants). It greets the user by name, then shows a computed "Daily Brief" strip (open jobs, candidates awaiting feedback, month-over-month applications, offers), 4 KPI cards (open positions / total candidates / upcoming interviews / offers), an analytics row (5-stage hiring funnel from `candidatesByStage`, a 6-month applications-trend bar chart bucketing `candidate.createdAt`, and a `candidate.source` conic donut), and three list panels (recent candidates, active job openings with applicant counts, upcoming interview sessions). Panel "View all" links deep-link into the Interview screen via the `interviewTab` param on `setActiveView` (`stores/ui.ts`); the header "Post a New Job"/"Add Candidate" buttons open `CreateJobDialog`/`CreateCandidateDialog` via their `trigger` prop, gated on `interview.job.create`/`interview.candidate.create`; offers-this-month uses hiring decisions gated on `interview.decision.view`.
- Platform administration (TeamSpaceOne staff panel): a dedicated organisation identified by `PLATFORM_ORGANISATION_SLUG` (org-service env; unset = feature off) acts as the platform org. The seeded `platform_super_admin` role (created by `db:seed:platform`, name is reserved so org admins can't create it) grants `admin.system.settings` — a permission `assertCanDelegatePermissions` blocks from org roles and `org_admin` explicitly denies. Platform API lives in `services/organisation/src/platform/` (`/platform/overview`, `/platform/organisations[...]`, `.../members`, `.../invitations`); `PlatformAdminGuard` requires `x-organisation-id` to BE the platform org AND the actor to hold `admin.system.settings` there (checking the permission alone is not enough — org owners' `*` grant wildcard-matches it). The gateway proxies `/platform` → org service with JWT auth. Member records are enriched via auth's `GET /auth/internal/users?ids=` batch lookup (internal key + `x-internal-caller`, 100-id cap). `GET /organisations/:id/me/context` returns `isPlatformOrganisation` which the desktop-next sidebar uses to show the `platform` view (`screens/platform.tsx`) — overview stats, searchable orgs table, per-org detail with members + invitations. Bootstrap: register the platform org via normal signup with the configured slug, run `DATABASE_URL=... pnpm --filter @teamspace-one/organisation-service db:seed:platform` (optionally `PLATFORM_ADMIN_USER_ID=<userId>` to grant the role to an existing user), then invite more platform staff via the normal member-invite flow picking the `platform_super_admin` role.
- RBAC: `packages/authorization` holds the permission catalogue, `can()` policy engine, React `PermissionProvider`/`useCan`/`PermissionGate`, and `RemotePermissionGuard` + `RequirePermissions` for Nest services. The organisation service resolves `AuthorizableUser` from its own DB; other services fetch `GET /organisations/:id/me/context` (internal key + actor headers, 30s cache) — they need `ORGANISATION_SERVICE_URL` and `@teamspace-one/authorization` as a dep (see `services/messaging`/`services/projects` for the wiring pattern). Frontend view gating lives in `apps/desktop/src/lib/view-permissions.ts`; blocked views render `screens/access-denied.tsx`. Every org role uses the same `RoleSidebar` chrome (`components/admin/role-sidebar.tsx`, both desktop apps): `useShellVariant()` returns `admin`/`hr`/`recruiter`/`member` — `member` (all non-admin/non-HR/non-recruiting roles incl. candidate/client) gets the common menus (Home/Channels/Messages/Meetings + My Attendance/My Timesheet/My Leaves/My Payroll/My Performance + Files/Help) with every item permission-filtered via `canAccessView`; `admin`/`hr` add their ops sections. `recruiter` (same detection as `useIsRecruitingRole`) swaps the Projects section for Jobs / Talent Pool / Interviews — standalone views (`screens/recruiting.tsx` wrapping `components/interview/{jobs-board,talent-pool,interviews-board}.tsx`), each gated on `interview.job.view`/`interview.candidate.view`/`interview.interview.view` in `view-permissions.ts`; the same boards also live as tabs inside the `interview` view (deep-linkable via the `interviewTab` store param). Internal members (not candidate/guest/external) with `collaboration.project.view` additionally get a Projects section — My Projects / My Tasks / Timelines deep-link into the `my-projects` screen via the `projectsTab` store param (mirrors `hrmsTab`); the screen hosts the per-project Gantt (`screens/project.tsx` `Gantt`, exported with a `compact` mode) and a "New Project" button gated on `collaboration.project.create` (PM/team-lead only — `ProjectDialog` is exported for reuse). The old AppRail + WorkspaceSidebar only remain in the mobile drawer/tablet shells; the channel/dm screens render their own list pane since no desktop variant has a workspace sidebar. The `interview` view additionally opens for any `interview.*` permission (staff roles lack `interview.access`) and the member sidebar surfaces it as an "Interview" item, so recruiters/hiring managers/interviewers (and candidates) can reach the recruitment workspace. Every internal staff role template shares `STAFF_BASELINE_ALLOW` in `authorization.service.ts` (channels, messages, meetings/calls, files incl. upload, projects/tasks, tickets, self-service HRMS, dashboard) — external roles (candidate, client/guest) exclude it; roles without an `hrms` data scope resolve to `own`, so self-service data stays limited to the member's own record. `seed-rbac` tops up missing permissions AND scopes on system roles and memberships, so a re-run backfills baseline additions on existing orgs.

## Useful Commands

- Build the desktop app: `pnpm build:desktop`
- Build only the frontend: `pnpm --filter @teamspace-one/desktop build`
- Start desktop dev: `pnpm dev:desktop`
- Start backend services: `pnpm docker:up` then `pnpm dev:gateway` etc.
- Voice calls need the native SFU running: `pnpm dev:sfu` (or `pnpm docker:up` includes it).
- Run tests: `pnpm test`
- Lint/typecheck: `pnpm lint` / `pnpm typecheck`
- Apply pending Prisma migration for a service (local Postgres): `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<db>?schema=public pnpm --filter @teamspace-one/<service> db:migrate`
- Seed/backfill RBAC (permissions registry, system role permissions + scopes, membership data scopes): `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<org-db>?schema=public pnpm --filter @teamspace-one/organisation-service db:seed:rbac`
- Service containers auto-apply pending Prisma migrations on start (`migrate deploy` runs in each Dockerfile's `CMD` before `node dist/main`). To apply manually on the server (Docker): `docker exec -w /app/services/<service> teamspace-one-<service>-service npx prisma migrate deploy` — containers already carry the correct `DATABASE_URL` (Postgres hostname is `postgres`, not `localhost`)
- The organisation-service container also runs `node dist/seed/seed-rbac.js` after `migrate deploy` — it seeds the permission registry and backfills system role permissions/scopes and membership data scopes (idempotent). Manual run: `docker exec teamspace-one-organisation-service node services/organisation/dist/seed/seed-rbac.js`
- HRMS service: `pnpm dev:hrms` / `pnpm build:hrms` (port 3013, db `hrms_db`, gateway prefix `/hrms`). See `docs/hrms.md`.
- Phase 7 added HRMS onboarding/offboarding/performance/analytics (`services/hrms/src/hrms/lifecycle.service.ts`, `performance.service.ts`, `analytics.service.ts`, `lifecycle.controller.ts`; migration `20240909000000_phase7_lifecycle`) and desktop tabs Onboarding/Offboarding/Performance/Analytics. Payroll flow: draft → `process` → `approve` → `mark-paid`, plus `GET /hrms/payroll/periods/:id/export` (CSV, `hrms.payroll.export`, audited via `hrms.payroll.exported`). Event wiring: interview `application.hired` → pending onboarding instance (INTERVIEW JetStream stream; consumer registered in `services/hrms/src/app.module.ts`, not EventsModule, to avoid a module cycle); `employee.created` → auto-onboarding from default template (lazy `ModuleRef` in `nats-consumer.service.ts`); `employee.terminated` → organisation service deletes the membership (`organisation-hrms-offboarding` consumer). Re-run `db:seed:rbac` so the employee role picks up `hrms.onboarding.view`/`hrms.performance.view`.
- Asset tracking lives in the **organisation service** (admin feature, like tickets): `services/organisation/src/assets/asset.service.ts` + `asset.controller.ts` (`/organisations/:id/assets` CRUD + `:assetId/assign` + `:assetId/return`; `admin.asset.view|create|edit|delete|assign`, migration `20260913000001_assets`). Assignments target org members (any role — validated directly against `organisation_memberships`); `assign`/`return` drive asset `status` in a transaction — `assigned` can't be set manually. Desktop `screens/assets.tsx` sits in the admin shell sidebar; `db:seed:rbac` tops up missing template permissions on system roles, so re-running it grants `admin.asset.*` to existing owner/org_admin roles.

## Authorization notes

- Canonical permissions live in `packages/authorization/src/permissions.ts`. Two-part permissions (e.g. `hrms.access`, `dashboard.view`) are stored in the `permissions` table with `resource='*'`; always use `permissionParts()`/`permissionKey()` from `@teamspace-one/authorization` when reading/writing registry rows — never split/join manually.
- `permissionMatches(granted, required)` supports trailing wildcards: `hrms.*` covers `hrms.employee.view` and `hrms.access`.
- Roles carry a `roleCategory` (`administrative|managerial|employee|member|external|candidate|guest`; migration `20260907000000_role_categories`). The org creator gets the system `owner` role ("Organisation Super Admin", category administrative) and is also auto-provisioned as an employee. Every membership except `external` and `guest` (client) auto-provisions an HRMS employee record. Admin role management (`POST/PATCH/DELETE /organisations/:id/roles`, member role assignment, `POST /members`) only accepts `administrative`/`managerial`; invitations also allow `member`/`external`/`guest`. `employee`/`candidate` come from HR onboarding and recruitment flows (`provisionMembershipFromEmployee` bypasses the category check intentionally). Role create/update enforces permission delegation (can't grant perms the actor lacks; `admin.system.settings` is platform-only) and reserved names; all role mutations write `audit_logs` rows.
- Other services resolve a caller's permissions/scopes via `GET {ORGANISATION_SERVICE_URL}/organisations/:id/me/context` (send `x-internal-api-key`, `x-internal-caller`, `x-actor-id`, `x-organisation-id`). See `services/hrms/src/hrms/authorization.client.ts` + `permission.guard.ts` for the pattern.

## File & Storage Notes

- The file-processing worker generates video thumbnails (and optional HLS previews) via `ffmpeg`/`ffprobe` — installed in `services/file-storage/Dockerfile` runner and needed on PATH for local dev (`brew install ffmpeg`).
- Set `FILE_HLS_ENABLED=true` to enable HLS transcoding (off by default; CPU-heavy).
- PDF/Office/CSV/EPUB text extraction uses `officeparser`; zip listings use `unzipper`.
- Uploads: clients should use `POST /files/presign-upload` (send hex `sha256`) → `PUT` to the returned URL with `uploadHeaders` → `POST /files/:id/complete`. The service enforces the checksum via S3 `ChecksumSHA256` and re-verifies on complete.
- Storage keys are `organisations/<orgId>/users/<uploaderId>/<typeFolder>/<ts>-<name>` where `typeFolder` is derived from MIME type (`fileTypeFolder` in `services/file-storage/src/storage/storage.service.ts`: images, videos, audio, documents, spreadsheets, presentations, archives, other). Previews nest under `<typeFolder>/previews/`.
- Quotas: `STORAGE_QUOTA_PER_USER_BYTES` (default 2 GiB) caps each uploader; the org limit is `memberCount × per-user quota` (member count via `GET /organisations/:id/members/count`, 30s cache; falls back to distinct uploader count). Enforced in `presignUpload`/`upload` (413 `PayloadTooLargeException`); all non-`failed` `FileRecord.size` values count. `GET /files/usage` reports per-user and per-org usage/limits.

## Frontend Stack

- React 19 + TypeScript
- Tailwind CSS v4 with CSS-first theming (`@theme` and `@custom-variant dark`)
- Radix UI primitives for accessible components
- Lucide icons
- Zustand for local UI state

## Design Tokens

Semantic tokens live in `apps/desktop/src/styles/index.css`:
- `--primary`, `--primary-hover`, `--primary-subtle`
- `--background`, `--surface`, `--surface-elevated`, `--border`
- `--text`, `--text-secondary`, `--text-muted`
- Status: `--success`, `--warning`, `--error`, `--info`, `--unread`, `--mention`, `--online`, etc.

## Architecture

- `src/components/ui/` — reusable UI primitives
- `src/components/navigation/` — app rail, workspace sidebar
- `src/components/layouts/` — app shell, status bar, right panel
- `src/components/search/` — global command/search
- `src/screens/` — top-level route screens
- `src/stores/ui.ts` — Zustand store for view, theme, panels, connection
- `src/features/dashboard/` — permission-filtered dashboard widget registry
- `src/lib/view-permissions.ts` — view → permission map enforced by `AppShell`
- `src/hooks/usePermissions.ts` — `usePermissions()`/`useMyContext()` RBAC helpers; `<PermissionGate>`/`useCan` come from `@teamspace-one/authorization/react`
- `src/lib/data.ts` — isolated mock data for visual development

## Key Behaviors

- Cmd/Ctrl + K opens global search.
- Theme toggles `dark` class on `<html>` and uses CSS variables.
- Sidebar is resizable and collapsible via the app rail or resizer.
- Right details panel can be toggled from channel/project headers.
- Connection status shown in the bottom status bar.

## Phase 0 — Repository Audit

- Architecture audit, current-state assessment, technical decisions, implementation roadmap, and permission matrix are in `docs/`.
- Current gaps: granular RBAC/data scopes, HRMS, AI Interview, employee/candidate identity separation, and permission-aware UI.
- Reusable assets: existing auth flow, organisation context middleware, outbox/NATS event plumbing, search service, AI service, file storage, notification service, realtime gateway, and desktop UI primitives.

## Phase 1–2 — RBAC + Role-Based Shell (status)

- `packages/authorization` holds the permission registry, policy engine (`can`/`hasAnyPermission`), navigation filter, React provider/gates (`./react` export), and Nest guards (`./guard`, `./nest`). Built CJS+ESM via `pnpm --filter @teamspace-one/authorization build`.
- Frontend permission context: `PermissionBoundary` in `App.tsx` fetches `GET /organisations/:id/me/context` → `PermissionProvider`. Views are gated via `src/lib/view-permissions.ts`; unauthorized views render `screens/access-denied.tsx`.
- Navigation and dashboard widgets are permission-filtered (`features/dashboard/registry.ts`). Views: `hrms`, `interview`, `admin` added to the `View` union.
- IMPORTANT: existing orgs/roles/memberships need `db:seed:rbac` (see commands) or users get no permissions.

## SFU tests and validation

- Native `rtc` build: `cd services/sfu && cargo check --features rtc`
- Legacy build: `cd services/sfu && cargo check`
- Unit/integration tests: `cd services/sfu && cargo test --features rtc` (also `cargo test` for legacy-path coverage)
- End-to-end smoke test (two clients via the SFU server):
  ```
  SFU_TOKEN_SECRET=dev SFU_PORT=28443 SFU_NAT_1TO1_IPS=127.0.0.1 cargo run --bin teamspace-sfu --features rtc
  SFU_URL=ws://127.0.0.1:28443 SFU_TOKEN_SECRET=dev DURATION_SECS=10 cargo run --example rtc_e2e_client --features rtc
  ```
- Simulcast layer selection wire format: `{"type":"layer","track_id":"<id>","rid":"f"}`.
- Real NAT/TURN validation requires a reachable TURN server or coturn instance and two clients on separate networks; set `SFU_ICE_SERVERS` to a JSON array of `{urls, username, credential}` and verify relay candidates are selected.
- Real-device mobile runs need an Android device (`adb`) or enrolled iOS device; simulators can exercise UI/signaling but cannot fully validate camera/mic/NAT paths.

## Native mobile builds (iOS / Android)

- iOS project is generated with XcodeGen: `cd apps/mobile-ios/TeamspaceOne && xcodegen generate`.
- iOS simulator build: `xcodebuild -project TeamspaceOne.xcodeproj -scheme TeamspaceOne -destination 'platform=iOS Simulator,id=<sim-id>' CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO build`.
- iOS real-device build requires `APPLE_DEVELOPMENT_TEAM` (or set `DEVELOPMENT_TEAM` in `project.yml`) and an enrolled device destination.
- Android compile check: `cd apps/mobile-android && ./gradlew :app:compileDebugKotlin`.
- Android debug install: `./gradlew :app:installDebug`.
- Android release signing uses env vars `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; falls back to the debug keystore if not set.
- Notification service typecheck: `pnpm --filter @teamspace-one/notification-service typecheck`.
- API gateway typecheck: `pnpm --filter @teamspace-one/api-gateway typecheck`.

## Desktop (Tauri) macOS signing and notarization

- The macOS `signingIdentity` and iOS `developmentTeam` in `apps/desktop/src-tauri/tauri.conf.json` can be overridden at build time with env vars.
- Required env vars for distribution:
  - `APPLE_DEVELOPMENT_TEAM` — iOS team ID (overrides `bundle.iOS.developmentTeam`).
  - `APPLE_SIGNING_IDENTITY` — macOS signing identity (overrides `bundle.macOS.signingIdentity`).
  - `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` — base64-encoded `.p12` and its password for CI.
  - Notarization (API key method): `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH`.
  - Notarization (Apple ID method, alternative): `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
- Updater signing needs `TAURI_SIGNING_PRIVATE_KEY` (path or content) and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The public key is already in `tauri.conf.json > plugins.updater.pubkey`.
- For CI, set these as repository secrets and pass them in `.github/workflows/release.yml`.

## Desktop (Tauri) auto-updater

- The in-app updater is implemented in `apps/desktop/src/components/update/update-checker.tsx` and mounted from `App.tsx`. Settings → About also has a "Check for updates" button (`requestUpdateCheck()`) that runs an interactive check and surfaces errors in the dialog — background-check failures are only `console.warn`ed.
- It calls `check()` from `@tauri-apps/plugin-updater` on launch and every 30 minutes, prompts the user to install, then asks to `relaunch()` via `@tauri-apps/plugin-process`.
- Release builds serve the frontend over `http://localhost:<random port>` via `tauri-plugin-localhost` (`lib.rs`), which Tauri's ACL treats as a REMOTE origin — any capability whose commands the frontend invokes must list `http://localhost:*/*` under `remote.urls` or the IPC call is denied. `default.json` does this; `desktop.json` (updater/process/global-shortcut) needs it too — without it `check()` is denied and the updater silently does nothing.
- Because `src-tauri/permissions/*.toml` exists, the app has an ACL manifest (`__app-acl__`) — EVERY custom `#[command]` must be listed in a permission set there and granted in a capability, or `invoke()` is denied on all origins. `app-commands` (permissions/app-commands.toml, granted in default.json) covers the general commands (`get_app_info`, `get_deep_link`, `store_secure_token`, etc.); media/screen-share have their own sets. When adding a command, add its invoked name (snake_case unless `rename=`) to a permission set or it silently fails.
- `tauri.conf.json > bundle.createUpdaterArtifacts` must be `true` so `tauri build` produces `.sig` files.
- `tauri:build` runs `scripts/bump-version.mjs` first to auto-increment the desktop version (patch by default). Use `BUMP_SKIP=1` to disable the auto-bump (e.g. local test builds). Manual bumps: `pnpm --filter @teamspace-one/desktop version:bump [patch|minor|major|x.y.z]`.
- The updater endpoint is configured to the marketing site so the same `public/downloads/` folder serves both the download buttons and the updater: `https://teamspaceone.in/downloads/update.json`.
- Generate a Tauri updater manifest with:
  ```
  pnpm --filter @teamspace-one/desktop updater:manifest --base-url https://teamspaceone.in/downloads
  ```
  or set `UPDATER_BASE_URL=https://teamspaceone.in/downloads` and run `pnpm --filter @teamspace-one/desktop tauri:build`.
- `tauri:build` now runs `scripts/generate-update-manifest.mjs` after bundling when `UPDATER_BASE_URL` is set.
- The manifest (`update.json`) is written to `apps/web/public/downloads/update.json` by default and served at the configured endpoint.
- CI: `azure-pipelines.yml` deploys `main` sequentially: build/start/health-check backend containers on the self-hosted `gce` agent, rebuild/verify web without `apps/web/public/downloads`, run `infra/gce/update-desktop.sh` once and share its generated production configuration with both desktop builders, build macOS + Windows bundles, then publish signed installers and the updater manifest. The `teamspace-one-production` Azure Environment needs an Exclusive lock check.
- Terraform startup provisions Azure Pipelines agent `5.279.0` as host systemd service `azure-pipelines-agent.service`; it reads the registration PAT from GCP Secret Manager secret `azure-devops-agent-pat` using the VM service account. The agent is intentionally outside Docker Compose so deployments cannot terminate their own agent.
- Azure pipeline variables needed: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and `APPLE_*` (optional notarization).

## Mobile push credentials still needed

- Android FCM: place `google-services.json` in `apps/mobile-android/app/` and configure the backend `GOOGLE_APPLICATION_CREDENTIALS` + `FIREBASE_PROJECT_ID`.
  - Add the Android app with package `com.teamspaceone.mobile` in the Firebase console.
  - Download the generated `google-services.json` and place it in `apps/mobile-android/app/`. It is gitignored by default.
  - For the backend, create/download a Firebase service-account key, set `GOOGLE_APPLICATION_CREDENTIALS` to its path and `FIREBASE_PROJECT_ID` to the project ID.
- iOS APNs: configure backend env vars `APN_KEY` (path to `.p8`), `APN_KEY_ID`, `APN_TEAM_ID`, `APN_BUNDLE_ID`.

## Universal links / App Links

- iOS: `project.yml` registers `applinks:app.teamspaceone.in`; `apple-app-site-association` is served by `api-gateway` at `/.well-known/apple-app-site-association`. Set `APPLE_TEAM_ID` on the gateway.
- Android: `AndroidManifest.xml` has `autoVerify` intent filters for `https://app.teamspaceone.in` (`/channel`, `/meeting`, `/file` prefixes). `assetlinks.json` is served by `api-gateway` at `/.well-known/assetlinks.json`. Set `ANDROID_CERT_FINGERPRINTS` (JSON array) on the gateway.
- Compute the release SHA-256 fingerprint with `keytool -list -v -keystore <keystore>`, or `./gradlew :app:signingReport` for debug. Add the fingerprints to the gateway env.
