import { LeaveSection } from "@/screens/hrms/leave";

/**
 * Personal leave page — available to every employee regardless of role
 * (the same section powers the HRMS "Leave" tab).
 */
export function MyLeavesScreen() {
  return (
    <div className="p-4 sm:p-6">
      <LeaveSection />
    </div>
  );
}
