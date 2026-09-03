-- AddColumn
ALTER TABLE "organisation_memberships" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientOrganisationId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_organisationId_idx" ON "clients"("organisationId");
