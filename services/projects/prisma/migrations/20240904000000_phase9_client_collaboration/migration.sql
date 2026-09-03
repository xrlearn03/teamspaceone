-- AddColumn
ALTER TABLE "projects" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approvals_organisationId_idx" ON "approvals"("organisationId");
CREATE INDEX "approvals_projectId_idx" ON "approvals"("projectId");
CREATE INDEX "approvals_resourceType_resourceId_idx" ON "approvals"("resourceType", "resourceId");
CREATE INDEX "approvals_status_idx" ON "approvals"("status");
