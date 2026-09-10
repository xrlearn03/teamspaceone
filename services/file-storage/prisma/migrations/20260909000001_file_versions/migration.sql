-- AlterTable
ALTER TABLE "files" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "versionGroupId" TEXT;

-- CreateIndex
CREATE INDEX "files_versionGroupId_idx" ON "files"("versionGroupId");
