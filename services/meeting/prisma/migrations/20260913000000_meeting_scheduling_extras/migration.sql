-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "meetings" ADD COLUMN "recurrence" TEXT;
ALTER TABLE "meetings" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "meetings" ADD COLUMN "joinCode" TEXT;

-- CreateIndex
CREATE INDEX "meetings_seriesId_idx" ON "meetings"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_organisationId_joinCode_key" ON "meetings"("organisationId", "joinCode");
