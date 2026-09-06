# Teamspace One — Architecture Audit

> Phase 0 deliverable. This document captures the existing repository structure, runtime architecture, security model, and the gaps that must be closed before the Collaboration, HRMS, and AI Interview modules can be delivered safely.

## 1. Executive Summary

Teamspace One is a **pnpm monorepo** containing a Tauri 2 desktop application, a Vite marketing website, shared packages, and a NestJS microservice backend. The current product is a functional collaboration workspace with:

- JWT-based authentication and refresh tokens
- Multi-organisation support with workspaces
- Channels, direct messages, threads, reactions, mentions
- Projects, tasks, approvals, comments
- Meetings and voice rooms backed by LiveKit and a Rust SFU
- File uploads to an S3-compatible store (MinIO)
- AI summaries, Q&A, task/decision extraction, and daily digests
- Permission-aware full-text search and realtime notifications

What is **not** present are the HRMS and AI Interview modules, a granular role-based access control system, data-scoped authorization, employee/candidate identity separation, and a permission-aware dashboard/navigation layer. This audit identifies those gaps and the assets that can be reused to close them.

## 2. Repository Layout

```text
/Volumes/SSD/MVP
├── apps/
│   ├── desktop/          # Tauri 2 + React 19 + TypeScript + Tailwind v4
│   └── web/              # Vite + React 19 marketing/landing site
├── packages/
│   ├── api-client/       # Minimal fetch-based API client
│   ├── event-contracts/  # NATS subject constants + event envelope helpers
│   ├── logger/           # Pino logger
│   ├── metrics/          # Prometheus metrics
│   ├── opentelemetry/    # OTel initialization
│   ├── organisation-context/  # AsyncLocalStorage request context
│   ├── types/            # Shared TypeScript interfaces
│   ├── ui/               # Shared Button + cn utility (very small)
│   └── validation/       # Zod schemas for app settings
├── services/
│   ├── api-gateway/      # Express/Nest proxy, JWT verification, rate limiting
│   ├── auth/             # Users, JWT tokens, refresh tokens
│   ├── organisation/     # Organisations, memberships, roles, invitations, workspaces
│   ├── messaging/        # Channels and messages
│   ├── projects/         # Projects, tasks, comments, approvals, activity
│   ├── meeting/          # Meetings, voice rooms, LiveKit tokens
│   ├── file-storage/     # Uploads, downloads, previews, S3/MinIO
│   ├── notification/     # In-app/email notifications, preferences
│   ├── search/           # Postgres full-text search + vector support
│   ├── ai/               # OpenAI integration, embeddings, extraction, confirmations
│   ├── audit/            # Audit event ingestion and dead-letter retries
│   ├── realtime/         # Socket.io gateway, presence, room access
│   └── sfu/              # Rust Selective Forwarding Unit for voice
├── docker/               # Postgres init, NATS config, OTel configs, backup
├── docker-compose.yml    # All local infrastructure + services
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

### 2.1 Apps

| App | Tech | Purpose | Key Entry Points |
| --- | --- | --- | --- |
| `apps/desktop` | Tauri 2, React 19, TypeScript, Tailwind v4, Zustand, TanStack Query | Primary user application (employees, recruiters, admins) | `src/App.tsx`, `src/components/layouts/app-shell.tsx`, `src/stores/ui.ts` |
| `apps/web` | Vite, React 19, TypeScript, Tailwind v4 | Public marketing/landing site | `src/App.tsx`, `src/components/Hero.tsx`, `src/main.tsx` |

### 2.2 Shared Packages

| Package | Responsibility | Notes |
| --- | --- | --- |
| `@teamspace-one/api-client` | Thin `fetch` wrapper with bearer token | Used by `apps/web` only; desktop uses its own `lib/api.ts` |
| `@teamspace-one/event-contracts` | NATS subject constants and `createEventEnvelope` helper | Strong foundation for event-driven integration |
| `@teamspace-one/organisation-context` | `AsyncLocalStorage` request context + middleware | Enforces `x-internal-api-key` and forwards `x-organisation-id`/`x-actor-id` |
| `@teamspace-one/types` | Shared TypeScript interfaces | Currently tiny; intended to grow |
| `@teamspace-one/ui` | Shared `Button` + `cn` | Needs expansion to become a real design-system package |
| `@teamspace-one/validation` | Zod schemas | Only `AppSettings` at present |

### 2.3 Backend Services

| Service | Database | Responsibilities |
| --- | --- | --- |
| `api-gateway` | none | JWT verification, proxying, rate limiting, security headers |
| `auth` | `identity_db` | User registration, login, refresh, logout, profile, tokens |
| `organisation` | `organisation_db` | Organisations, memberships, roles, invitations, workspaces, clients |
| `messaging` | `messaging_db` | Channels, DMs, messages, threads, reactions, mentions |
| `projects` | `project_db` | Projects, tasks, comments, attachments, approvals, activity |
| `meeting` | `meeting_db` | Meetings, voice rooms, participants, reactions, raise hands |
| `file-storage` | `file_db` | Presigned uploads, downloads, previews, external shares |
| `notification` | `notification_db` | Notification records, preferences, deliveries |
| `search` | `search_db` | Full-text + vector search documents with permission JSON |
| `ai` | `ai_db` | OpenAI calls, embeddings, AI documents, extracted tasks/decisions, confirmations |
| `audit` | `audit_db` | Audit events, dead-letter events |
| `realtime` | `realtime_db` | Socket.io presence and resource access cache |
| `sfu` | none (Rust) | Voice/video relay |

## 3. Runtime Architecture

### 3.1 Request Flow

```text
Desktop/Tauri WebView
       │
       ▼
  API Gateway (3000)
       │
       ├── /auth  ───────────► auth-service (3002)
       ├── /organisations ───► organisation-service (3003)
       ├── /channels, /messages ─► messaging-service (3004)
       ├── /projects, /tasks, /approvals ─► projects-service (3006)
       ├── /meetings ────────► meeting-service (3009)
       ├── /files ───────────► file-storage-service (3010)
       ├── /search ──────────► search-service (3011)
       ├── /ai ──────────────► ai-service (3012)
       └── /notifications ───► notification-service (3008)
```

- The gateway verifies the JWT, strips spoofable identity headers, and sets `x-actor-id`.
- It injects `x-internal-api-key` into every proxied request.
- Each downstream service runs `OrganisationContextMiddleware` to validate the internal key and build an `AsyncLocalStorage` context.

### 3.2 Event-Driven Integration

- Every service uses an **Outbox pattern**: writes events to a local `OutboxEvent` table, then a scheduler publishes them to NATS JetStream.
- Subjects are defined in `packages/event-contracts/src/subjects.ts`.
- Downstream services consume via `nats-consumer.service.ts` and write to an `InboxEvent` table.
- This gives eventual consistency, replay, and auditability without direct service coupling.

### 3.3 Realtime

- `realtime-service` exposes a Socket.io namespace `/realtime`.
- Connection validates the access token with `JWT_SECRET`.
- `join`, `join-project`, `join-meeting`, etc. check the `resource_access` table before admitting a socket to a room.
- `resource_access` is populated by reacting to membership events from other services.

### 3.4 Search & AI Indexing

- `search-service` builds `search_documents` rows from outbox events, storing `permissions` JSON for filtering.
- `ai-service` builds `ai_documents` with `vector(1536)` for similarity search.
- Postgres `pgvector` is used for both full-text and vector queries.

## 4. Authentication & Authorization (Current)

### 4.1 Auth Mechanism

- `POST /auth/register` and `POST /auth/login` return an access token (JWT, HS256, configurable TTL) and a refresh token (random 32-byte hex, SHA-256 hash stored).
- Refresh rotates the token pair and deletes the old hash.
- Desktop stores tokens in the OS keychain (via Tauri `invoke`), with SQLite and `localStorage` fallbacks.
- `AuthGuard` in `auth-service` accepts either:
  - `Authorization: Bearer <jwt>` for users
  - `x-internal-api-key` + `x-internal-caller` for service-to-service calls

### 4.2 Organisation Membership & Roles

- `auth.prisma` defines `User` and `RefreshToken`.
- `organisation.prisma` defines `Organisation`, `OrganisationMembership`, `Role`, `Invitation`, `Workspace`, `Client`.
- `Role` has a `permissions` JSON array (default `[]` or `["*"]` for the owner role).
- `OrganisationMembership` has exactly one `roleId`.
- Role checks today are hardcoded: `owner`, `admin`, or `members.manage` in `organisation.service.ts`.

### 4.3 Access Control Gaps

| Concern | Current State | Required State |
| --- | --- | --- |
| Permission model | String array inside `Role.permissions` JSON | Dedicated `Permission` table + `RolePermission` + `UserRole` + `DataScope` |
| Data scope | None (owner/member binary) | `own`, `team`, `department`, `assigned`, `organisation` |
| Module-level visibility | Not enforced | Dynamic navigation + route guards |
| Service-level enforcement | `assertMemberOf`, `ownedChannel`, `ownerProject` | Central policy engine |
| Candidate identity | Treated as a `User`/`Client` | Separate `Candidate` entity linked to a user |
| Employee identity | Not separated from user | `Employee` profile linked to `OrganisationMembership` |

## 5. Frontend Architecture

### 5.1 Desktop Shell

- `App.tsx` mounts an `AuthGate` that shows `AuthScreen` or `OnboardingScreen` or `AppShell`.
- `AppShell` renders `AppRail`, `WorkspaceSidebar`, main content, `RightPanel`, `StatusBar`, `CommandMenu`, `IncomingCallOverlay`, `NotificationToasts`.
- Navigation is **view-state based** (`useUIStore.activeView`) with a `View` union: `home`, `inbox`, `channel`, `dm`, `project`, `meeting`, `voice`, `files`, `ai`, `members`, `saved`, `drafts`, `settings`.
- `WorkspaceSidebar` lists channels, DMs, projects, meetings, files, and settings.

### 5.2 State Management

- **Zustand** `ui.ts`: theme, active view, organisation/workspace, sidebar/right panel state, connection status, toasts.
- **TanStack Query** (`hooks/api.ts`) for server state: queries/mutations for auth, orgs, channels, messages, projects, tasks, meetings, files, notifications, AI, search.
- **React Query cache invalidation** drives UI updates; realtime events also invalidate relevant queries.

### 5.3 Design System

- CSS-first Tailwind v4 theme in `apps/desktop/src/styles/index.css`.
- Semantic tokens: `--primary`, `--background`, `--surface`, `--border`, `--text`, status colors, etc.
- Components under `apps/desktop/src/components/ui/` are built with Radix primitives (avatar, button, card, dialog, dropdown, input, separator, skeleton, tooltip, etc.).
- `packages/ui` is currently minimal and should be expanded to share the full primitive set.

### 5.4 API Client

- `apps/desktop/src/lib/api.ts` is a robust wrapper around `@tauri-apps/plugin-http`.
- Handles token read/write from keychain, refresh token rotation, 401 cleanup, 429 retries, organisation header injection, and form data.
- Type definitions for all DTOs live in the same file.
- `packages/api-client` is a lightweight fetch wrapper but is not used by the desktop app.

## 6. Data Layer

- **Postgres 16 with pgvector**.
- Each service owns a separate database (`identity_db`, `organisation_db`, etc.) but they run on the same server in local dev.
- **Prisma ORM** with per-service generated clients.
- Primary keys use `cuid()`; organisation-scoped tables include `organisationId`.
- Outbox/Inbox event tables are duplicated in every service.

## 7. Security Model (As-Is)

| Control | Implementation |
| --- | --- |
| No plaintext passwords | `bcryptjs` with cost 12 |
| JWT signing | `HS256`, secret from `JWT_SECRET` |
| Service authentication | `INTERNAL_API_KEY` + `x-internal-caller` |
| Spoof protection | Gateway strips `x-actor-id`, `x-internal-api-key`, etc. |
| Token storage | OS keychain + SQLite + localStorage fallback |
| CORS | Configurable `CORS_ORIGINS` |
| CSP | Tauri `csp` restricts connect-src |
| Rate limiting | In-memory per-IP in gateway |
| File access | `file-storage` validates `organisationId` + `uploaderId` |
| Realtime access | `resource_access` table checked before joining rooms |

Security gaps: no granular permission enforcement, no audit of permission changes, no data masking for sensitive HRMS fields, and no candidate isolation.

## 8. Testing

- Only `tests/load/api-smoke.js` exists (k6 load test for register + list orgs).
- No unit, integration, or e2e test suites for authorization or business logic.
- This is a high-risk gap given the permission-sensitive product requirements.

## 9. Reusable Assets

The following existing work can be reused with minimal change:

- **Auth flow**: token issuance, refresh, keychain storage, login/register UI.
- **Organisation context middleware**: extend with permission checks.
- **Outbox/NATS plumbing**: reuse for HRMS and Interview events.
- **Search service**: extend `SearchDocument` extraction for `employee`, `candidate`, `job_opening`, `interview_session`.
- **AI service**: reuse provider abstraction, embeddings, confirmation pattern for AI Interview.
- **File storage**: reuse presign/complete flow and access control for resumes, payslips, documents.
- **Notification service**: add event types for HRMS/Interview.
- **Realtime gateway**: add rooms for `employee`, `candidate`, `interview`.
- **UI primitives**: Button, Card, Dialog, Input, Badge, Avatar, EmptyState, Skeleton, etc.
- **Desktop shell**: AppShell, sidebar, status bar, command palette, toasts.

## 10. Key Gaps & Risks

| # | Gap | Risk | Phase to Address |
| --- | --- | --- | --- |
| 1 | No granular permission system | Users can see/do too much; no module/data scoping | 1 |
| 2 | No `Permission`/`RolePermission`/`UserRole`/`DataScope` tables | Cannot implement the required matrix | 1 |
| 3 | No employee/candidate/department models | HRMS and Interview modules have no foundation | 4, 5 |
| 4 | No audit logging of permission or data access | Cannot detect or investigate unauthorized access | 1, 8 |
| 5 | No role-based dashboard or navigation | One generic dashboard for all roles | 2 |
| 6 | No `permission-matrix.md` enforcement layer | Matrix is only aspirational | 1 |
| 7 | No payroll/PII data masking | Salary and personal data may leak | 4, 8 |
| 8 | Candidate portal does not exist | External candidate experience missing | 5 |
| 9 | No automated test suite | Unsafe to add large features | Every phase |
| 10 | `packages/ui` not used by desktop | Design system is not actually shared | 1, 2 |

## 11. Conclusion

The codebase is a **solid collaboration platform** with good separation of concerns, event-driven integration, organisation isolation, and a polished desktop shell. The next critical step is not building more features, but establishing the **authorization foundation** (Phase 1). Once granular RBAC, data scopes, and permission-aware navigation are in place, the existing collaboration primitives can be safely extended, and the new HRMS and AI Interview services can be added as first-class domains.
