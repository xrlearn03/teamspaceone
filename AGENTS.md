# Reactify Connect — Agent Notes

## Project

- Monorepo with pnpm workspaces.
- Root: `/Volumes/SSD/MVP`.
- `apps/desktop/` is the Tauri 2 + React + TypeScript + Tailwind CSS v4 desktop app.

## Useful Commands

- Build the desktop app: `pnpm build:desktop`
- Build only the frontend: `pnpm --filter @reactify/desktop build`
- Start desktop dev: `pnpm dev:desktop`
- Start backend services: `pnpm docker:up` then `pnpm dev:gateway` etc.
- Run tests: `pnpm test`
- Lint/typecheck: `pnpm lint` / `pnpm typecheck`

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
