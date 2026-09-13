-- Internal support tickets raised from the Help Center, routed to an assignee role.
-- Idempotent: safe to re-run after a partially applied attempt.
CREATE TABLE IF NOT EXISTS "tickets" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'new',
    "requesterId" TEXT NOT NULL,
    "assigneeRoleId" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tickets_organisationId_idx" ON "tickets"("organisationId");
CREATE INDEX IF NOT EXISTS "tickets_organisationId_requesterId_idx" ON "tickets"("organisationId", "requesterId");
CREATE INDEX IF NOT EXISTS "tickets_organisationId_assigneeRoleId_idx" ON "tickets"("organisationId", "assigneeRoleId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_organisationId_fkey'
    ) THEN
        ALTER TABLE "tickets"
        ADD CONSTRAINT "tickets_organisationId_fkey"
        FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_assigneeRoleId_fkey'
    ) THEN
        ALTER TABLE "tickets"
        ADD CONSTRAINT "tickets_assigneeRoleId_fkey"
        FOREIGN KEY ("assigneeRoleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
