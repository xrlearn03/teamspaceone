-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "assetTag" TEXT,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "purchaseDate" DATE,
    "purchaseCost" DOUBLE PRECISION,
    "warrantyEnd" DATE,
    "vendor" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_organisationId_idx" ON "assets"("organisationId");

-- CreateIndex
CREATE INDEX "assets_organisationId_status_idx" ON "assets"("organisationId", "status");

-- CreateIndex
CREATE INDEX "asset_assignments_organisationId_idx" ON "asset_assignments"("organisationId");

-- CreateIndex
CREATE INDEX "asset_assignments_assetId_idx" ON "asset_assignments"("assetId");

-- CreateIndex
CREATE INDEX "asset_assignments_organisationId_assigneeUserId_idx" ON "asset_assignments"("organisationId", "assigneeUserId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
