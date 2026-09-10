-- AlterTable
ALTER TABLE "messages" ADD COLUMN "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_channelId_pinnedAt_idx" ON "messages"("channelId", "pinnedAt");
