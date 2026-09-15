ALTER TABLE "time_entries" ADD COLUMN "attendanceRecordId" TEXT;

CREATE UNIQUE INDEX "time_entries_attendanceRecordId_key" ON "time_entries"("attendanceRecordId");
