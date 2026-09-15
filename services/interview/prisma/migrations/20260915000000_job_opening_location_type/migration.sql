-- Job postings carry a location, workplace mode (Remote/Hybrid/On-site) and
-- employment type (Full-time/Part-time/Contract) for the Jobs board.

ALTER TABLE "JobOpening" ADD COLUMN "location" TEXT;
ALTER TABLE "JobOpening" ADD COLUMN "workplaceType" TEXT;
ALTER TABLE "JobOpening" ADD COLUMN "employmentType" TEXT;
