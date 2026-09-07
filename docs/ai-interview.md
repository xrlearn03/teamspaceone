# AI Interview Module

> Phase 5 foundation — Recruitment, candidate management, interview scheduling, evaluations, and hiring decisions.

## Service

- `services/interview` — `@teamspace-one/interview-service`, NestJS + Prisma, port `3014`, database `interview_db`.
- Gateway: `/interview/*` → `INTERVIEW_SERVICE_URL` (default `http://localhost:3014`), JWT-verified at the gateway.
- Local dev: `pnpm dev:interview` · Build: `pnpm build:interview`.
- Docker: `interview-service` in `docker-compose.yml`; `interview_db` created by `docker/postgres-init/00-create-databases.sql`.

## Authorization model

- `src/interview/authorization.client.ts` resolves caller context from `GET /organisations/:id/me/context`.
- `src/interview/permission.guard.ts` enforces `@RequirePermissions(...)`.
- Data scope enforcement in `interview.service.ts`:
  - `organisation` → all jobs, candidates, sessions.
  - `assigned` → jobs where user is recruiter/hiring manager/creator, candidates tied to those jobs, sessions where user is a participant/creator.
  - `own` → candidate portal (reserved for future portal linking).

## Schema

`JobOpening`, `Candidate`, `CandidateApplication`, `InterviewSession`, `InterviewParticipant`, `InterviewEvaluation`, plus `OutboxEvent`/`InboxEvent`.

## Pipeline

```
applied → screening → shortlisted → interview → evaluation → offer → hired | rejected
```

Stage transitions are controlled by `PATCH /interview/applications/:id/stage` (`interview.candidate.edit`).

## Endpoints

| Route | Permission |
| --- | --- |
| `GET /interview/overview` | any of `interview.job.view`, `interview.candidate.view`, `interview.interview.view` |
| `GET/POST /interview/jobs` | `interview.job.view` / `interview.job.create` |
| `PATCH /interview/jobs/:id` | `interview.job.edit` |
| `GET/POST /interview/candidates` | `interview.candidate.view` / `interview.candidate.create` |
| `PATCH /interview/applications/:id/stage` | `interview.candidate.edit` |
| `GET/POST /interview/sessions` | `interview.interview.view` / `interview.interview.schedule` |
| `GET /interview/evaluations/pending` | `interview.interview.evaluate` / `interview.decision.view` |
| `POST /interview/sessions/:id/evaluations` | `interview.interview.evaluate` |

### Phase 6 — AI screening + AI interview

New schema: `InterviewTemplate`, `InterviewQuestion`, `ScreeningResult`, `InterviewAnswer`, `HiringDecision`; `InterviewEvaluation` gained `source` (`human`/`ai`), `aiMetadata`, `reviewedBy`, `reviewedAt`. Migration: `services/interview/prisma/migrations/20260907000000_phase6_ai_interview`.

| Route | Permission |
| --- | --- |
| `POST /interview/applications/:id/screen` | `interview.screening.run` |
| `GET /interview/applications/:id/screening` | `interview.screening.view` |
| `POST /interview/applications/:id/screening/review` | `interview.interview.approve` |
| `GET/POST /interview/templates` · `PATCH/DELETE /interview/templates/:id` | `interview.template.*` |
| `POST /interview/sessions/:id/ai/start` | `interview.interview.conduct` |
| `POST /interview/sessions/:id/ai/answer` | `interview.interview.conduct` |
| `GET /interview/sessions/:id/ai/transcript` | `interview.interview.view` |
| `POST /interview/sessions/:id/ai/evaluate` | `interview.interview.evaluate` |
| `GET /interview/sessions/:id/evaluations` | `interview.interview.view` |
| `POST /interview/evaluations/:id/review` | `interview.interview.edit-evaluation` |
| `POST /interview/applications/:id/decision` | `interview.decision.make` |
| `GET /interview/decisions` | `interview.decision.view` |

The interview service orchestrates AI work through `services/ai` via `src/interview/ai.client.ts` (internal-key headers, `AI_SERVICE_URL`, `FILE_STORAGE_SERVICE_URL` for resume text via `resumeFileId` → file `metadata.extractedText`/`textPreview`). AI failures surface as `503 ServiceUnavailable`.

### AI service (`services/ai`)

- `src/ai/providers/ai-provider.ts` — provider abstraction (`AI_PROVIDER`, `AI_BASE_URL`, `OPENAI_API_KEY`/`AI_API_KEY`, `AI_MODEL`, `AI_EMBEDDING_MODEL`); `completeJson` does strict JSON output with one retry and returns token usage. Deterministic fallbacks (`model: 'none'`) when unconfigured.
- `src/ai/prompts/prompts.ts` — versioned prompts (`screening.v1`, `interview.questions.v1`, `interview.evaluate.v1`) with safety rules (no protected-attribute inference, evidence-only scoring, untrusted-content delimiters).
- Endpoints: `POST /ai/interview/screen`, `/ai/interview/questions`, `/ai/interview/evaluate`.
- `AiAuditLog` table (`ai_audit_logs`) records every interview AI call: action, actor, model, promptVersion, token usage, status. Migration: `services/ai/prisma/migrations/20260907000000_phase6_ai_interview`.

### Human review

All AI output is stored as `status: 'ai_generated'` / `source: 'ai'` and is clearly labeled in the UI. Screening results are marked `reviewed` via the screening review endpoint; AI evaluations are reviewed/edited via `POST /interview/evaluations/:id/review` which stamps `reviewedBy`/`reviewedAt`. Hiring decisions are always human (`interview.decision.make`) and recorded in `HiringDecision`.

### Frontend (Phase 6)

- `components/interview/screening-dialog.tsx` — run screening, match score, skills/missing-requirement chips, confidence, "Mark reviewed".
- `components/interview/ai-interview-dialog.tsx` — text-based AI interview (start → per-question answers → transcript → AI evaluation → human review form).
- `components/interview/hiring-decision-dialog.tsx` — offer/hire/reject/hold + rationale.
- `components/interview/templates-panel.tsx` — Templates tab on the interview screen.
- API hooks in `src/lib/api.ts` + `src/hooks/api.ts`; all actions permission-gated via `useCan`.

## Frontend

- `apps/desktop/src/screens/interview.tsx` — tabbed `InterviewScreen` with Overview, Jobs, Candidates, Sessions, Evaluations.
- Dashboard widgets: `open-positions`, `candidate-pipeline`, `interviews-today`, `pending-evaluations`.
- App rail / `view-permissions.ts` gate on `interview.access`.

## Next steps

- Resume upload UX via `file-storage` presigned flow binding `resumeFileId` (screening already reads resume text from file-storage when bound).
- Candidate portal in `apps/web` for public application/interview access.
- Voice/video AI interview sessions (architecture hooks in place; Phase 6 ships text).
- Notification wiring for screening completed / AI evaluation ready for review.
