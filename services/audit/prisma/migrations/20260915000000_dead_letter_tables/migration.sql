-- CreateTable
CREATE TABLE "dead_letter_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "subject" TEXT NOT NULL,
    "originalEvent" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "service" TEXT,
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "organisationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retriedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dead_letter_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_retries" (
    "id" TEXT NOT NULL,
    "deadLetterEventId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "retriedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_retries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dead_letter_events_eventId_idx" ON "dead_letter_events"("eventId");

-- CreateIndex
CREATE INDEX "dead_letter_events_organisationId_idx" ON "dead_letter_events"("organisationId");

-- CreateIndex
CREATE INDEX "dead_letter_events_createdAt_idx" ON "dead_letter_events"("createdAt");

-- CreateIndex
CREATE INDEX "dead_letter_retries_deadLetterEventId_idx" ON "dead_letter_retries"("deadLetterEventId");

-- AddForeignKey
ALTER TABLE "dead_letter_retries" ADD CONSTRAINT "dead_letter_retries_deadLetterEventId_fkey" FOREIGN KEY ("deadLetterEventId") REFERENCES "dead_letter_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
