-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "roomName" TEXT;
UPDATE "meetings" SET "roomName" = id WHERE "roomName" IS NULL;
ALTER TABLE "meetings" ALTER COLUMN "roomName" SET NOT NULL;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_roomName_key" UNIQUE ("roomName");
ALTER TABLE "meetings" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'meeting';

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "isScreenSharing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_participants_meetingId_idx" ON "meeting_participants"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_participants_organisationId_idx" ON "meeting_participants"("organisationId");

-- CreateIndex
CREATE INDEX "meeting_participants_userId_idx" ON "meeting_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_userId_key" ON "meeting_participants"("meetingId", "userId");

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "meetings_status_idx" ON "meetings"("status");
