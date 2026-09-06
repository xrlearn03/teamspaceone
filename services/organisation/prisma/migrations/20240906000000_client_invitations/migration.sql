-- AddColumns
ALTER TABLE "invitations" ADD COLUMN "clientId" TEXT;
ALTER TABLE "organisation_memberships" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "invitations_clientId_idx" ON "invitations"("clientId");

-- CreateIndex
CREATE INDEX "organisation_memberships_clientId_idx" ON "organisation_memberships"("clientId");
