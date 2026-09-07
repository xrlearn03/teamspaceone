# Teamspace One — Agent Notes

## Project

- Monorepo with pnpm workspaces.
- Root: `/Volumes/SSD/MVP`.
- `apps/desktop/` is the Tauri 2 + React + TypeScript + Tailwind CSS v4 desktop app.
- `apps/web/` is the marketing/landing website (Vite + React + TS + Tailwind v4). Dev: `pnpm dev:web`, build: `pnpm build:web`. Installer downloads live in `apps/web/public/downloads/`; the Windows `.exe` still needs to be built on Windows/CI and placed there.

## Security model (added in audit remediation)

- Required env vars (no insecure defaults): `JWT_SECRET`, `INTERNAL_API_KEY`, `SFU_TOKEN_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `NATS_USER`/`NATS_PASSWORD`, `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`, `S3_ACCESS_KEY`/`S3_SECRET_KEY`. See root `.env.example`.
- All service HTTP requests require `x-internal-api-key` (enforced by `OrganisationContextMiddleware` from `@teamspace-one/organisation-context`); `/health` and `/socket.io` are exempt. The API gateway attaches the key when proxying and sets `x-actor-id` from the verified JWT — clients cannot spoof identity headers (stripped inbound).
- Service-to-service HTTP calls must send `x-internal-api-key` + `x-internal-caller: <service-name>` and propagate `x-actor-id`/`x-organisation-id` when acting for a user.
- The SFU (`services/sfu`, Rust) requires an HMAC token in `Join`: clients call `POST /meetings/:id/sfu-token` (issued by meeting-service after participant check) and pass it in the join message.
- CORS: gateway + realtime use `CORS_ORIGINS` (comma-separated); defaults cover Tauri/Vite dev origins.
- Direct calls to a service port in local dev need the `x-internal-api-key` header (value = `INTERNAL_API_KEY`).
- RBAC: `packages/authorization` holds the permission catalogue, `can()` policy engine, React `PermissionProvider`/`useCan`/`PermissionGate`, and `RemotePermissionGuard` + `RequirePermissions` for Nest services. The organisation service resolves `AuthorizableUser` from its own DB; other services fetch `GET /organisations/:id/me/context` (internal key + actor headers, 30s cache) — they need `ORGANISATION_SERVICE_URL` and `@teamspace-one/authorization` as a dep (see `services/messaging`/`services/projects` for the wiring pattern). Frontend view gating lives in `apps/desktop/src/lib/view-permissions.ts`; blocked views render `screens/access-denied.tsx`.

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
- HRMS service: `pnpm dev:hrms` / `pnpm build:hrms` (port 3013, db `hrms_db`, gateway prefix `/hrms`). See `docs/hrms.md`.

## Authorization notes

- Canonical permissions live in `packages/authorization/src/permissions.ts`. Two-part permissions (e.g. `hrms.access`, `dashboard.view`) are stored in the `permissions` table with `resource='*'`; always use `permissionParts()`/`permissionKey()` from `@teamspace-one/authorization` when reading/writing registry rows — never split/join manually.
- `permissionMatches(granted, required)` supports trailing wildcards: `hrms.*` covers `hrms.employee.view` and `hrms.access`.
- Other services resolve a caller's permissions/scopes via `GET {ORGANISATION_SERVICE_URL}/organisations/:id/me/context` (send `x-internal-api-key`, `x-internal-caller`, `x-actor-id`, `x-organisation-id`). See `services/hrms/src/hrms/authorization.client.ts` + `permission.guard.ts` for the pattern.

## File & Storage Notes

- The file-processing worker generates video thumbnails (and optional HLS previews) via `ffmpeg`/`ffprobe` — installed in `services/file-storage/Dockerfile` runner and needed on PATH for local dev (`brew install ffmpeg`).
- Set `FILE_HLS_ENABLED=true` to enable HLS transcoding (off by default; CPU-heavy).
- PDF/Office/CSV/EPUB text extraction uses `officeparser`; zip listings use `unzipper`.
- Uploads: clients should use `POST /files/presign-upload` (send hex `sha256`) → `PUT` to the returned URL with `uploadHeaders` → `POST /files/:id/complete`. The service enforces the checksum via S3 `ChecksumSHA256` and re-verifies on complete.

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
