-- Create ResourceAccess read model for realtime room-authorization cache
CREATE TABLE "resource_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resource_access_userId_resourceType_resourceId_key" ON "resource_access"("userId", "resourceType", "resourceId");
CREATE INDEX "resource_access_resourceType_resourceId_idx" ON "resource_access"("resourceType", "resourceId");
CREATE INDEX "resource_access_organisationId_idx" ON "resource_access"("organisationId");
