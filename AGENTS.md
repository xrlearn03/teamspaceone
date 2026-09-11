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
- SFU recording: internal control API on `SFU_CONTROL_PORT` (default 8445, not published) — meeting-service `setRecording` calls `POST /rooms/:id/recording/start|stop` with an HMAC `x-sfu-control-token`. Per-track files (`.ogg`/`.ivf`/`.h264`) land in `SFU_RECORDING_DIR` and are uploaded to file-storage as the recorder's uploads on stop or when the room drains. Needs `FILE_STORAGE_SERVICE_URL` + `INTERNAL_API_KEY` on the SFU.
- CORS: gateway + realtime use `CORS_ORIGINS` (comma-separated); defaults cover Tauri/Vite dev origins.
- Direct calls to a service port in local dev need the `x-internal-api-key` header (value = `INTERNAL_API_KEY`).
- Member invite flow: `POST /organisations/:id/members/invite` (`admin.user.manage`, email + roleId + optional names) → org service calls auth `POST /auth/internal/provision` (internal key + `x-internal-caller` only; the gateway strips `x-internal-caller` from clients so it can't be reached externally) → user created with a generated temp password and `mustChangePassword` → membership + `MEMBER_INVITED` event → notification service emails credentials. Invited users are forced through a set-new-password screen on first login. Employee/candidate category roles are rejected (they onboard via HR/recruitment workflows). Needs `AUTH_SERVICE_URL` on the organisation service.
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
- The organisation-service container also runs `node dist/seed/seed-rbac.js` after `migrate deploy` — it seeds the permission registry and backfills system role permissions/scopes and membership data scopes (idempotent). Manual run: `docker exec teamspace-one-organisation-service node services/organisation/dist/seed/seed-rbac.js`
- HRMS service: `pnpm dev:hrms` / `pnpm build:hrms` (port 3013, db `hrms_db`, gateway prefix `/hrms`). See `docs/hrms.md`.
- Phase 7 added HRMS onboarding/offboarding/performance/analytics (`services/hrms/src/hrms/lifecycle.service.ts`, `performance.service.ts`, `analytics.service.ts`, `lifecycle.controller.ts`; migration `20240909000000_phase7_lifecycle`) and desktop tabs Onboarding/Offboarding/Performance/Analytics. Payroll flow: draft → `process` → `approve` → `mark-paid`, plus `GET /hrms/payroll/periods/:id/export` (CSV, `hrms.payroll.export`, audited via `hrms.payroll.exported`). Event wiring: interview `application.hired` → pending onboarding instance (INTERVIEW JetStream stream; consumer registered in `services/hrms/src/app.module.ts`, not EventsModule, to avoid a module cycle); `employee.created` → auto-onboarding from default template (lazy `ModuleRef` in `nats-consumer.service.ts`); `employee.terminated` → organisation service deletes the membership (`organisation-hrms-offboarding` consumer). Re-run `db:seed:rbac` so the employee role picks up `hrms.onboarding.view`/`hrms.performance.view`.

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

- The in-app updater is implemented in `apps/desktop/src/components/update/update-checker.tsx` and mounted from `App.tsx`.
- It calls `check()` from `@tauri-apps/plugin-updater` on launch and every 30 minutes, prompts the user to install, then asks to `relaunch()` via `@tauri-apps/plugin-process`.
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
- CI: `azure-pipelines.yml` deploys `main` sequentially: build/start/health-check backend containers on the self-hosted `gce` agent, rebuild/verify web without `apps/web/public/downloads`, build macOS + Windows desktop bundles, then publish signed installers and the updater manifest. The `teamspace-one-production` Azure Environment needs an Exclusive lock check.
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
