CREATE TABLE "task_attachments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_attachments_taskId_fileId_key" ON "task_attachments"("taskId", "fileId");
CREATE INDEX "task_attachments_fileId_idx" ON "task_attachments"("fileId");

ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
