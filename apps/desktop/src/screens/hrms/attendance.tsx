import { CalendarCheck } from "lucide-react";
import { EmptyState } from "../../components/ui/empty-state";

export function AttendanceSection() {
  return (
    <EmptyState
      icon={CalendarCheck}
      title="Attendance"
      description="Attendance tracking will be available once HRMS data is wired up."
    />
  );
}
