-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_organisationId_idx" ON "folders"("organisationId");

-- CreateIndex
CREATE INDEX "folders_organisationId_category_idx" ON "folders"("organisationId", "category");

-- CreateIndex
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");

-- AlterTable
ALTER TABLE "files" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE INDEX "files_folderId_idx" ON "files"("folderId");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
