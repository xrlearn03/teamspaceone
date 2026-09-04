-- Add assigneeId to AI extracted tasks for auto-assignment
ALTER TABLE "ai_extracted_tasks" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
CREATE INDEX IF NOT EXISTS "ai_extracted_tasks_assignee_idx" ON "ai_extracted_tasks" ("assigneeId");
