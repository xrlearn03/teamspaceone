import { JobsBoard } from "../components/interview/jobs-board";
import { TalentPool } from "../components/interview/talent-pool";
import { InterviewsBoard } from "../components/interview/interviews-board";

/**
 * Standalone recruiting screens — the same boards the interview workspace
 * hosts as tabs, rendered top-level so the recruiter sidebar can deep-link
 * straight into each one.
 */
function ScreenShell({ children }: { children: React.ReactNode }) {
  return <div className="p-3 sm:p-4 lg:p-6">{children}</div>;
}

export function JobsScreen() {
  return (
    <ScreenShell>
      <JobsBoard />
    </ScreenShell>
  );
}

export function TalentPoolScreen() {
  return (
    <ScreenShell>
      <TalentPool />
    </ScreenShell>
  );
}

export function InterviewsScreen() {
  return (
    <ScreenShell>
      <InterviewsBoard />
    </ScreenShell>
  );
}
