-- Role categories: administrative | managerial | employee | member | external | candidate | guest
ALTER TABLE "roles" ADD COLUMN "roleCategory" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "roles" ADD COLUMN "createdBy" TEXT;

-- Backfill categories for the seeded system roles.
UPDATE "roles" SET "roleCategory" = 'administrative' WHERE "name" IN ('owner', 'org_admin', 'hr_admin');
UPDATE "roles" SET "roleCategory" = 'managerial' WHERE "name" IN ('recruiter', 'hiring_manager', 'manager', 'interviewer');
UPDATE "roles" SET "roleCategory" = 'employee' WHERE "name" = 'employee';
UPDATE "roles" SET "roleCategory" = 'candidate' WHERE "name" = 'candidate';
UPDATE "roles" SET "roleCategory" = 'guest' WHERE "name" = 'client';
-- Custom roles created through the administrative role builder predate
-- categories; classify them as administrative.
UPDATE "roles" SET "roleCategory" = 'administrative' WHERE "isSystem" = false AND "roleCategory" = 'member';

ALTER TABLE "roles" ADD CONSTRAINT "roles_roleCategory_check"
  CHECK ("roleCategory" IN ('administrative', 'managerial', 'employee', 'member', 'external', 'candidate', 'guest'));
