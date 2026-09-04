ALTER TABLE "projects" ADD COLUMN "startDate" TIMESTAMP(3), ADD COLUMN "targetDate" TIMESTAMP(3), ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium', ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "tasks_projectId_idx";
CREATE INDEX "tasks_projectId_status_position_idx" ON "tasks"("projectId", "status", "position");

CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_comments" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_attachments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_activity" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_activity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");
CREATE INDEX "project_comments_projectId_createdAt_idx" ON "project_comments"("projectId", "createdAt");
CREATE INDEX "project_comments_authorId_idx" ON "project_comments"("authorId");
CREATE UNIQUE INDEX "project_attachments_projectId_fileId_key" ON "project_attachments"("projectId", "fileId");
CREATE INDEX "project_attachments_fileId_idx" ON "project_attachments"("fileId");
CREATE INDEX "project_activity_projectId_createdAt_idx" ON "project_activity"("projectId", "createdAt");

ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "project_members" ("id", "projectId", "userId", "role")
SELECT CONCAT('migration-', "id"), "id", "ownerId", 'owner' FROM "projects"
ON CONFLICT ("projectId", "userId") DO NOTHING;
