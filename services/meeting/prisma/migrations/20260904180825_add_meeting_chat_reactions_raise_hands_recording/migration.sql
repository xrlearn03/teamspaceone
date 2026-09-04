-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "isRecording" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recordingEgressId" TEXT;

-- CreateTable
CREATE TABLE "meeting_messages" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_reactions" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_raise_hands" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "raised" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_raise_hands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_messages_meetingId_idx" ON "meeting_messages"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_messages_organisationId_idx" ON "meeting_messages"("organisationId");

-- CreateIndex
CREATE INDEX "meeting_messages_createdAt_idx" ON "meeting_messages"("createdAt");

-- CreateIndex
CREATE INDEX "meeting_reactions_meetingId_idx" ON "meeting_reactions"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_reactions_organisationId_idx" ON "meeting_reactions"("organisationId");

-- CreateIndex
CREATE INDEX "meeting_raise_hands_meetingId_idx" ON "meeting_raise_hands"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_raise_hands_organisationId_idx" ON "meeting_raise_hands"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_raise_hands_meetingId_userId_key" ON "meeting_raise_hands"("meetingId", "userId");

-- AddForeignKey
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_reactions" ADD CONSTRAINT "meeting_reactions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_raise_hands" ADD CONSTRAINT "meeting_raise_hands_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
