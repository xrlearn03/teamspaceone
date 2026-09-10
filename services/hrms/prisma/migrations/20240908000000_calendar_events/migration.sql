-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "visibility" TEXT NOT NULL DEFAULT 'organisation',
    "employeeId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_sourceType_sourceId_key" ON "calendar_events"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "calendar_events_organisationId_idx" ON "calendar_events"("organisationId");

-- CreateIndex
CREATE INDEX "calendar_events_organisationId_startAt_idx" ON "calendar_events"("organisationId", "startAt");
