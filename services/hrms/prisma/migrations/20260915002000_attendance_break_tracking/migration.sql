ALTER TABLE "attendance_records"
ADD COLUMN "breakStartedAt" TIMESTAMP(3),
ADD COLUMN "breakMinutes" INTEGER NOT NULL DEFAULT 0;
