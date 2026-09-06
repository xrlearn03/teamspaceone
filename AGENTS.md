# Teamspace One — Agent Notes

## Project

- Monorepo with pnpm workspaces.
- Root: `/Volumes/SSD/MVP`.
- `apps/desktop/` is the Tauri 2 + React + TypeScript + Tailwind CSS v4 desktop app.
- `apps/web/` is the marketing/landing website (Vite + React + TS + Tailwind v4). Dev: `pnpm dev:web`, build: `pnpm build:web`. Installer downloads live in `apps/web/public/downloads/`; the Windows `.exe` still needs to be built on Windows/CI and placed there.

## Useful Commands

- Build the desktop app: `pnpm build:desktop`
- Build only the frontend: `pnpm --filter @teamspace-one/desktop build`
- Start desktop dev: `pnpm dev:desktop`
- Start backend services: `pnpm docker:up` then `pnpm dev:gateway` etc.
- Voice calls need the native SFU running: `pnpm dev:sfu` (or `pnpm docker:up` includes it).
- Run tests: `pnpm test`
- Lint/typecheck: `pnpm lint` / `pnpm typecheck`
- Apply pending Prisma migration for a service (local Postgres): `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<db>?schema=public pnpm --filter @teamspace-one/<service> db:migrate`
- Apply pending migration on the server (Docker): `docker exec -w /app/services/<service> teamspace-one-<service>-service npx prisma migrate deploy` — containers already carry the correct `DATABASE_URL` (Postgres hostname is `postgres`, not `localhost`)

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
- `src/lib/data.ts` — isolated mock data for visual development

## Key Behaviors

- Cmd/Ctrl + K opens global search.
- Theme toggles `dark` class on `<html>` and uses CSS variables.
- Sidebar is resizable and collapsible via the app rail or resizer.
- Right details panel can be toggled from channel/project headers.
- Connection status shown in the bottom status bar.
