-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "meeting_invitees" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_invitees_meetingId_idx" ON "meeting_invitees"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_invitees_organisationId_idx" ON "meeting_invitees"("organisationId");

-- CreateIndex
CREATE INDEX "meeting_invitees_userId_idx" ON "meeting_invitees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_invitees_meetingId_userId_key" ON "meeting_invitees"("meetingId", "userId");

-- AddForeignKey
ALTER TABLE "meeting_invitees" ADD CONSTRAINT "meeting_invitees_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
