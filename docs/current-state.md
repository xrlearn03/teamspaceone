# Teamspace One — Current State

> Phase 0 deliverable. A feature-by-feature assessment of what works today, where the code lives, and what is missing.

## 1. Authentication

### What works

- **Registration, login, logout, token refresh** (`services/auth/src/auth/`)
- Passwords hashed with `bcryptjs` (cost 12)
- Access JWT signed with `JWT_SECRET` (`HS256`)
- Refresh tokens stored as SHA-256 hashes in `refresh_tokens`
- Desktop token persistence in OS keychain / SQLite / `localStorage`
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`
- `AuthScreen` in `apps/desktop/src/screens/auth.tsx` handles login / register / accept-invite modes

### What is missing

- Email verification
- Password reset flow
- Session/device management
- Account deactivation
- Audit logging of auth events

## 2. Organisation & Membership

### What works

- `Organisation`, `OrganisationMembership`, `Role`, `Invitation`, `Workspace`, `Client` models in `services/organisation/prisma/schema.prisma`
- Create organisation during onboarding (`services/organisation/src/organisation/organisation.service.ts`)
- Owner and `member` roles are seeded per organisation
- Owner role has `["*"]` permissions; member role has `[]`
- Organisation switcher in `AppRail` and `WorkspaceSidebar`
- Workspace creation and selection
- Invitation creation and redemption (public token flow)
- `/organisations` routes via `api-gateway` and `organisation-service`

### What is missing

- System-wide permission registry
- Multiple roles per membership
- Data scopes (`own`, `team`, `department`, `assigned`, `organisation`)
- Fine-grained role management UI
- Role assignment flow for invitations/members
- Separation of **user account**, **organisation membership**, and **employee profile**

## 3. Collaboration — Channels & Messages

### What works

- Public and private channels
- Direct messages and group conversations (`type === 'direct'`, `directKey` of sorted member ids)
- Message creation, editing, deletion, thread replies
- Reactions, mentions, attachments
- Message pagination with cursor
- `WorkspaceSidebar` lists channels and DMs
- `ChannelScreen` and `DirectMessageScreen`
- Realtime `join`/`leave` and message broadcasts

### Where the code lives

- Schema: `services/messaging/prisma/schema.prisma`
- API: `services/messaging/src/messaging/messaging.controller.ts` and `messaging.service.ts`
- Frontend: `apps/desktop/src/screens/channel.tsx`, `direct-message.tsx`, `components/chat/*`
- Hooks: `apps/desktop/src/hooks/api.ts` (`useChannels`, `useMessages`, `useSendMessage`, etc.)

### What is missing

- Permission-aware message editing/deletion (only "owner" of the message or channel owner can edit/delete)
- Channel-level role permissions
- File upload integration for message attachments
- Pinned messages and search within a channel

## 4. Collaboration — Projects & Tasks

### What works

- Project creation, update, archive
- Project members and ownership
- Task creation, status, priority, assignee, due dates, dependencies
- Task attachments, comments, approvals
- Project activity feed
- `ProjectScreen` and task UI

### Where the code lives

- Schema: `services/projects/prisma/schema.prisma`
- API: `services/projects/src/projects/projects.controller.ts` and `projects.service.ts`
- Frontend: `apps/desktop/src/screens/project.tsx`

### What is missing

- Permission gates for who can create projects (any member today)
- Scoped task visibility beyond project membership
- Approval workflow tied to roles
- Project templates and onboarding task generation

## 5. Meetings & Voice

### What works

- Scheduled and instant meetings
- Voice rooms
- Native Rust SFU for video/audio (`meeting-service` issues SFU join tokens)
- Rust SFU for native voice
- Meeting messages, reactions, raise hands, screen sharing, recording state
- `MeetingScreen` and `VoiceRoomScreen`
- Token gating for joining (`meeting-service` validates membership and issues SFU tokens)

### Where the code lives

- Schema: `services/meeting/prisma/schema.prisma`
- API: `services/meeting/src/meeting/meeting.controller.ts`
- Realtime: `services/realtime/src/realtime/realtime.gateway.ts`
- SFU: `services/sfu/`
- Frontend: `apps/desktop/src/screens/meeting.tsx`, `voice-room.tsx`, `components/livekit/` (pre-call lobby UI, no LiveKit dependency)

### What is missing

- Interview-specific meeting configuration
- Recording transcripts fed into AI Interview evaluations
- Calendar integration for interview scheduling

## 6. Files

### What works

- Presigned upload flow: `POST /files/presign-upload` → `PUT` to S3/MinIO → `POST /files/:id/complete`
- SHA-256 checksum enforcement
- File listing, preview, download
- External share links with expiry and max views
- Thumbnail and text extraction previews (ffmpeg / officeparser)

### Where the code lives

- Schema: `services/file-storage/prisma/schema.prisma`
- API: `services/file-storage/src/file-storage/file-storage.controller.ts`
- Frontend: `apps/desktop/src/screens/file-browser.tsx`, `components/ui/message-attachment.tsx`

### What is missing

- Category-based permissions (e.g., payslip, resume, employee document)
- Permission-aware file search indexing
- Document versioning
- HRMS document folders

## 7. Notifications

### What works

- In-app notifications stored per user
- Unread count endpoint
- Mark read / mark all read
- Notification preferences per event type
- Realtime `notification.created` broadcast to user rooms

### Where the code lives

- Schema: `services/notification/prisma/schema.prisma`
- API: `services/notification/src/notification/notification.controller.ts`
- Frontend: `apps/desktop/src/components/ui/notification-toasts.tsx`, `useNotifications`

### What is missing

- Event types for HRMS (leave approval, attendance correction) and Interview (scheduled, feedback requested, decision)
- Email delivery (SMTP configured but not wired into all event types)
- Push/desktop notifications for candidate interview reminders

## 8. Search

### What works

- Full-text search over messages, tasks, projects, files, meetings, channels, users
- Permission JSON filtering (`public`, `private`, `channel`, `project`, etc.)
- Vector similarity search in `ai_documents` (pgvector)
- `CommandMenu` global search UI

### Where the code lives

- Schema: `services/search/prisma/schema.prisma`
- API: `services/search/src/search/search.controller.ts` and `search.service.ts`
- Frontend: `apps/desktop/src/components/search/command-menu.tsx`

### What is missing

- Employee, candidate, job opening, interview session indexing
- Search results scoped by role/data scope
- Advanced filters (date, author, resource type, department)

## 9. AI Assistant

### What works

- OpenAI provider with `OPENAI_API_KEY` or `LOCAL_AI_URL`
- Summarize, ask, daily digest, task extraction, decision extraction
- Embeddings stored in `ai_documents.vector`
- Human-in-the-loop action confirmations (`ai_action_confirmations`)
- `AIAssistantScreen` and home dashboard AI daily brief card

### Where the code lives

- Schema: `services/ai/prisma/schema.prisma`
- API: `services/ai/src/ai/ai.controller.ts` and `ai.service.ts`
- Frontend: `apps/desktop/src/screens/ai-assistant.tsx`, `screens/home.tsx` (daily brief)

### What is missing

- Resume parsing and job matching
- Text-based AI interview session
- Interview transcript analysis and scoring
- Explainable, human-reviewed AI evaluation
- AI audit logging

## 10. Dashboard / Navigation

### What works

- `HomeScreen` with greeting, quick actions, my tasks, upcoming meetings, recent conversations, recent projects, AI daily brief
- `AppRail` with Home, Inbox, Messages, Projects, Meetings, AI Assistant, Search, Settings
- `WorkspaceSidebar` with collapsible sections
- Resizable sidebar, dark mode, command palette (`Cmd/Ctrl + K`)
- Organisation switcher

### Where the code lives

- `apps/desktop/src/screens/home.tsx`
- `apps/desktop/src/components/navigation/app-rail.tsx`
- `apps/desktop/src/components/navigation/workspace-sidebar.tsx`
- `apps/desktop/src/stores/ui.ts`

### What is missing

- Role-based navigation (everyone sees the same rail/sidebar)
- Role-based dashboard widgets
- Permission-aware quick actions
- HRMS and Interview navigation sections
- 403 / access denied states

## 11. Security & Authorization

### What works

- Organisation isolation in every service
- Internal API key for service-to-service calls
- Gateway JWT verification and spoofable header stripping
- Realtime room access checks
- Search permission JSON filter

### What is missing

- Granular permission model and enforcement
- Data scopes
- Permission-aware frontend components and routes
- Sensitive data masking (salary, SSN, etc.)
- Audit log consumption for security events

## 12. Web App

### What works

- Marketing landing page with Hero, Features, Why Teamspace, Footer
- Download buttons for desktop installers

### Where the code lives

- `apps/web/src/App.tsx` and `components/*`

### What is missing

- Candidate portal
- Interviewer public join links
- Any authenticated web views

## 13. DevOps & Tooling

### What works

- `pnpm` workspaces + `turbo` pipeline for build/dev/test/lint/typecheck
- `docker-compose.yml` for local Postgres, Redis, NATS, MinIO, SFU, Jaeger, OTel, and all services
- Per-service Dockerfiles and base image
- Environment example in `.env.example`
- `pnpm dev:desktop`, `pnpm docker:up`, `pnpm dev:gateway`, etc.

### What is missing

- CI/CD beyond `.github/workflows` (if any)
- Automated unit/integration/e2e tests
- Seed data scripts for HRMS/Interview development
- Production deployment documentation

## 14. Summary Table

| Capability | Status | Notes |
| --- | --- | --- |
| Authentication | ✅ Partial | Login/register/refresh works; email/device/audit missing |
| Organisation & workspaces | ✅ Working | Multi-org supported |
| Channels & messaging | ✅ Working | Needs permission refinement |
| Projects & tasks | ✅ Working | Needs permission refinement |
| Meetings & voice | ✅ Working | Ready for interview reuse |
| Files | ✅ Working | Needs document categories |
| Notifications | ✅ Working | Needs HR/Interview event types |
| Search | ✅ Working | Needs employee/candidate indexing |
| AI assistant | ✅ Working | Reusable for interview intelligence |
| RBAC | ❌ Missing | Coarse roles only |
| Permission-aware UI | ❌ Missing | Rail/sidebar is static |
| Dashboard | ❌ Generic | One dashboard for all |
| HRMS | ❌ Missing | No employee/department/leave/payroll |
| AI Interview | ❌ Missing | No candidate/job/interview/evaluation |
| Candidate portal | ❌ Missing | No public candidate experience |
| Audit logging | ❌ Partial | Service exists but not wired to permission events |
| Automated tests | ❌ Missing | Only a k6 smoke test |
