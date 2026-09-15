CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employmentType" TEXT,
    "joiningDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "compensation" JSONB NOT NULL,
    "content" TEXT,
    "documentFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offers_applicationId_key" ON "offers"("applicationId");
CREATE INDEX "offers_organisationId_idx" ON "offers"("organisationId");
CREATE INDEX "offers_organisationId_status_idx" ON "offers"("organisationId", "status");
ALTER TABLE "offers" ADD CONSTRAINT "offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
