-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "parentMessageId" TEXT;

-- CreateIndex
CREATE INDEX "messages_parentMessageId_idx" ON "messages"("parentMessageId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
