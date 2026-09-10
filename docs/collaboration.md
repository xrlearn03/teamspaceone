# Collaboration Module — Phase 3

Status: foundation complete. The module builds on the pre-existing messaging,
projects, file-storage, realtime, notification, and meeting services, and adds
RBAC enforcement plus permission-aware UI.

## Architecture

```text
Desktop app (React)
    ↓ REST via API gateway (JWT → x-actor-id)
services/messaging   — channels, DMs, group conversations, messages, threads, reactions, mentions
services/projects    — projects, tasks, comments, attachments, approvals, activity
services/file-storage — presign-upload → PUT → complete (SHA-256 enforced)
services/meeting     — meetings, voice rooms, calendar events (foundation)
services/realtime    — socket.io rooms; channel/project/meeting membership re-checked server-side
services/notification — derives notifications from NATS events (message created, task updates, approvals, mentions)
```

## Authorization

Two layers are enforced:

1. **Permission checks** — every route that mutates or reads collaboration
   resources is annotated with `@RequirePermissions(...)` and guarded by
   `RemotePermissionGuard` (`@teamspace-one/authorization/nest`). The guard
   resolves the caller's `AuthorizableUser` from the organisation service
   (`GET /organisations/:id/me/context`, internal-key authenticated, 30s cache)
   and evaluates `can()` locally. Routes without the decorator (e.g.
   `GET /channels/:id/access`, used by realtime) pass through.
2. **Data scope** — the services keep enforcing resource-level rules
   themselves: private channels/DMs require membership, channel manage/delete
   requires channel-owner role, message edit/delete requires authorship,
   project/task reads require project membership.

### Endpoint → permission map

| Route | Permission |
| --- | --- |
| `GET /channels` | `collaboration.channel.view` |
| `POST /channels` | `collaboration.channel.create` |
| `POST /channels/direct` | `collaboration.message.send` |
| `PATCH /channels/:id`, `PUT /channels/:id/members` | `collaboration.channel.manage` |
| `DELETE /channels/:id` | `collaboration.channel.delete` |
| `GET /channels/:id/messages`, `GET /messages/:id/thread` | `collaboration.message.view` |
| `POST /messages`, `POST /messages/:id/reactions` | `collaboration.message.send` |
| `PATCH /messages/:id` | `collaboration.message.edit` |
| `DELETE /messages/:id` | `collaboration.message.delete` |
| `POST /projects` | `collaboration.project.create` |
| `GET /projects*` | `collaboration.project.view` |
| `PATCH /projects/:id` | `collaboration.project.manage` |
| `DELETE /projects/:id` | `collaboration.project.delete` |
| tasks/comments/dependencies/approvals | `collaboration.task.*` |
| project/task attachments | `collaboration.file.view` / `.upload` / `.delete` |
| `GET /files*` (list/get/download/preview/shares) | `collaboration.file.view` |
| `POST /files/presign-upload`, `POST /files/:id/complete`, `POST /files/upload`, `POST /files/:id/shares` | `collaboration.file.upload` |
| `DELETE /files/:id`, `DELETE /files/shares/:shareId` | `collaboration.file.delete` |
| `GET /meetings/calendar/events` | meeting participants only (service-level) |

### Resource-scoped file access

`FileRecord.resourceType`/`resourceId` link a file to its owning resource. For
`channel`, `project`, `task`, and `meeting` bindings, file-storage verifies the
actor's access by calling the owning service's `/…/:id/access` endpoint over
authenticated service-to-service HTTP before returning metadata, download URLs,
streams, previews, or shares. Uploaders always retain access to their own
files; unlinked files (e.g. avatars, file-browser uploads) keep
organisation-level access. `GET /files` only lists unlinked files plus the
actor's own uploads — private-channel attachments are reachable through the
channel, not the global listing.

Uploads pass the binding at presign time (`resourceType` + `resourceId`), and
the declared binding is verified before the upload URL is issued. The desktop
client binds channel attachments to their channel and project/task attachments
to their project.

Service-to-service callers must propagate `x-actor-id`; automation (e.g. the
AI service creating tasks) inherits the caller's permissions — there is no
privilege bypass.

## Frontend gates

- `PermissionProvider` (from `@teamspace-one/authorization/react`) wraps the
  app shell in `App.tsx` and is fed by `GET /organisations/:id/me/context`.
- `VIEW_PERMISSIONS` (`lib/view-permissions.ts`) maps top-level views to
  required permissions; `AppShell` renders `AccessDeniedScreen` for blocked
  views.
- Sidebar create menu and navigation items are permission-filtered.
- Channel screen: settings/manage gated on `channel.manage`, delete on
  `channel.delete`, composer on `message.send`, attachments on
  `file.upload`, call buttons on `meeting.create`.
- Project screen: create/settings/delete, task create/edit/delete and board
  drag are all gated.

## Features delivered

- Public/private channels, direct messages (2–20 members), group conversations
- Threaded replies (`thread-panel.tsx`), message edit/delete, reactions, @mentions
- Attachments via the file-storage presign flow (`uploadFile` → `attachmentIds`)
- Offline message queue (SQLite outbox in Tauri, localStorage in dev)
- Projects with board/list/timeline views, task dependencies, comments,
  approvals, attachments, activity feed
- Notifications: message/mention, channel invite (`CHANNEL_CREATED` and added
  members on `CHANNEL_MEMBERS_UPDATED`), task created/updated/completed,
  approvals, meeting start; `notification.created` realtime event refreshes
  the inbox
- Calendar foundation: `GET /meetings/calendar/events?from&to` returns
  scheduled meetings as generic calendar events (`useCalendarEvents` hook)

## Configuration

- `ORGANISATION_SERVICE_URL` is now required by `messaging-service`,
  `projects-service`, and `file-storage-service` (set in `docker-compose.yml`;
  use `http://localhost:3003` for local dev). `file-storage-service` also needs
  `MESSAGING_SERVICE_URL`, `PROJECTS_SERVICE_URL`, and `MEETING_SERVICE_URL`
  for resource-scoped file access checks.
- `RemotePermissionGuard` is covered by `services/messaging/test/remote-permission.guard.spec.ts`.

## Known limitations / next steps

- Channel "manage" currently requires org permission + channel-owner role;
  a channel-level moderator role is not implemented.
- Files bound to resource types outside `channel`/`project`/`task`/`meeting`
  (e.g. `avatar`, `ai-document`) keep organisation-level access.
- Removing a member from a channel does not revoke access to files they
  previously downloaded (signed URLs are short-lived, which bounds this).
- Calendar events only cover meetings; HRMS leave/holidays land in Phase 4+.
- `RemotePermissionGuard` caches contexts for 30s — permission changes take
  up to 30s to propagate to messaging/projects/file-storage.
