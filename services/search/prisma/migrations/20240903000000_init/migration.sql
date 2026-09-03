-- CreateTable
CREATE TABLE "search_index" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "organisationId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_index_resourceType_resourceId_key" ON "search_index"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "search_index_organisationId_idx" ON "search_index"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_eventId_key" ON "InboxEvent"("eventId");

-- CreateIndex
CREATE INDEX "InboxEvent_eventId_idx" ON "InboxEvent"("eventId");

-- CreateIndex
CREATE INDEX "InboxEvent_organisationId_idx" ON "InboxEvent"("organisationId");
