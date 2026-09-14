-- AlterTable
ALTER TABLE "messages" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN "metadata" JSONB;
