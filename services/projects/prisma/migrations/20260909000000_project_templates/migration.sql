-- AlterTable
ALTER TABLE "projects" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "templateId" TEXT;

-- CreateIndex
CREATE INDEX "projects_organisationId_isTemplate_idx" ON "projects"("organisationId", "isTemplate");

-- CreateIndex
CREATE INDEX "projects_templateId_idx" ON "projects"("templateId");
