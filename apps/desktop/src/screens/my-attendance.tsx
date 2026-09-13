import { AttendanceSection } from "./hrms/attendance";

/**
 * Personal attendance page — available to every employee regardless of role
 * (the same section powers the HRMS "Attendance" tab).
 */
export function MyAttendanceScreen() {
  return (
    <div className="p-4 sm:p-6">
      <AttendanceSection />
    </div>
  );
}
