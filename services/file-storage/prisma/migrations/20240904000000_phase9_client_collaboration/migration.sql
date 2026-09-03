-- CreateTable
CREATE TABLE "external_shares" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxViews" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_shares_token_key" ON "external_shares"("token");
CREATE INDEX "external_shares_fileId_idx" ON "external_shares"("fileId");
CREATE INDEX "external_shares_organisationId_idx" ON "external_shares"("organisationId");

-- AddForeignKey
ALTER TABLE "external_shares" ADD CONSTRAINT "external_shares_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
