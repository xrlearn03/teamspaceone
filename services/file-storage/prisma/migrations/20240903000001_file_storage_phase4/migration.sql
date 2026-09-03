-- AlterTable
ALTER TABLE "files" ADD COLUMN "resourceType" TEXT;
ALTER TABLE "files" ADD COLUMN "resourceId" TEXT;
ALTER TABLE "files" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'attachment';
ALTER TABLE "files" ADD COLUMN "bucket" TEXT NOT NULL DEFAULT 'reactify';
ALTER TABLE "files" ADD COLUMN "etag" TEXT;
ALTER TABLE "files" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'uploaded';
ALTER TABLE "files" ADD COLUMN "previewUrl" TEXT;
ALTER TABLE "files" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "files" ADD COLUMN "metadata" JSONB;
ALTER TABLE "files" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "files" ALTER COLUMN "url" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "files_resourceType_resourceId_idx" ON "files"("resourceType", "resourceId");
CREATE INDEX "files_category_idx" ON "files"("category");
CREATE INDEX "files_status_idx" ON "files"("status");

-- CreateTable
CREATE TABLE "file_previews" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "previewType" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_previews_storageKey_key" ON "file_previews"("storageKey");
CREATE INDEX "file_previews_fileId_idx" ON "file_previews"("fileId");
CREATE INDEX "file_previews_organisationId_idx" ON "file_previews"("organisationId");

-- AddForeignKey
ALTER TABLE "file_previews" ADD CONSTRAINT "file_previews_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
