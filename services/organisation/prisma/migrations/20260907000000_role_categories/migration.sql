-- Role categories: administrative | managerial | employee | member | external | candidate | guest
-- Idempotent: safe to re-run after a partially applied attempt.
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "roleCategory" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- Backfill categories for the seeded system roles. Name-based only: the
-- column naming of isSystem/isDefault differs between environments
-- (isSystem vs is_system), so we don't reference them here.
UPDATE "roles" SET "roleCategory" = 'administrative' WHERE "name" IN ('owner', 'org_admin', 'hr_admin');
UPDATE "roles" SET "roleCategory" = 'managerial' WHERE "name" IN ('recruiter', 'hiring_manager', 'manager', 'interviewer');
UPDATE "roles" SET "roleCategory" = 'employee' WHERE "name" = 'employee';
UPDATE "roles" SET "roleCategory" = 'candidate' WHERE "name" = 'candidate';
UPDATE "roles" SET "roleCategory" = 'guest' WHERE "name" = 'client';
-- Anything left at the 'member' default is a custom role created through the
-- administrative role builder; classify it as administrative.
UPDATE "roles" SET "roleCategory" = 'administrative' WHERE "roleCategory" = 'member';

ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_roleCategory_check";
ALTER TABLE "roles" ADD CONSTRAINT "roles_roleCategory_check"
  CHECK ("roleCategory" IN ('administrative', 'managerial', 'employee', 'member', 'external', 'candidate', 'guest'));
