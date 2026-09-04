ALTER TABLE "channels" ADD COLUMN "directKey" TEXT;
ALTER TABLE "messages" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "channel_members" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channels_organisationId_directKey_key" ON "channels"("organisationId", "directKey");
CREATE UNIQUE INDEX "channel_members_channelId_userId_key" ON "channel_members"("channelId", "userId");
CREATE INDEX "channel_members_userId_idx" ON "channel_members"("userId");
CREATE UNIQUE INDEX "message_attachments_messageId_fileId_key" ON "message_attachments"("messageId", "fileId");
CREATE INDEX "message_attachments_fileId_idx" ON "message_attachments"("fileId");
DROP INDEX "messages_channelId_idx";
CREATE INDEX "messages_channelId_createdAt_idx" ON "messages"("channelId", "createdAt");

ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "channel_members" ("id", "channelId", "userId", "role")
SELECT CONCAT('migration-', "id"), "id", "createdBy", 'owner' FROM "channels"
ON CONFLICT ("channelId", "userId") DO NOTHING;
