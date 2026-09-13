-- Owner-scoped time entries for the My Timesheet screen. Entries may link
-- to a project and/or task (nullable so ad-hoc labels like "Team Meeting"
-- work), with minutes + billable flag driving the weekly grid and stats.
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "label" TEXT,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "time_entries_organisationId_userId_date_idx" ON "time_entries"("organisationId", "userId", "date");
CREATE INDEX "time_entries_projectId_idx" ON "time_entries"("projectId");
CREATE INDEX "time_entries_taskId_idx" ON "time_entries"("taskId");

ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
