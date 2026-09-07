import { useState } from "react";
import {
  BarChart3,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  FileText,
  ShieldAlert,
  Users,
} from "lucide-react";
import { usePermissions } from "../hooks/usePermissions";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Skeleton } from "../components/ui/skeleton";
import {
  useCandidates,
  useInterviewOverview,
  useInterviewSessions,
  useJobOpenings,
  usePendingEvaluations,
} from "../hooks/api";
import {
  CreateCandidateDialog,
  CreateJobDialog,
  CreateSessionDialog,
} from "../components/interview/create-dialogs";
import { ResumeUploadButton } from "../components/interview/resume-upload";
import { RunScreeningButton } from "../components/interview/screening-dialog";
import { AiInterviewButton } from "../components/interview/ai-interview-dialog";
import { HiringDecisionButton } from "../components/interview/hiring-decision-dialog";
import { TemplatesSection } from "../components/interview/templates-panel";

type TabId = "overview" | "jobs" | "candidates" | "sessions" | "evaluations" | "templates";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "jobs", label: "Job openings", icon: Briefcase, permission: "interview.job.view" },
  { id: "candidates", label: "Candidates", icon: Users, permission: "interview.candidate.view" },
  { id: "sessions", label: "Sessions", icon: CalendarClock, permission: "interview.interview.view" },
  { id: "evaluations", label: "Evaluations", icon: ClipboardCheck, permission: "interview.interview.evaluate" },
  { id: "templates", label: "Templates", icon: FileText, permission: "interview.template.view" },
];

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview: "Interview",
  evaluation: "Evaluation",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

function SectionShell({ children }: { children: React.ReactNode }) {
  return <div className="grid auto-rows-min grid-cols-1 gap-4 xl:grid-cols-2">{children}</div>;
}

function OverviewSection() {
  const { data: overview, isLoading, isError, refetch } = useInterviewOverview();
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (isError || !overview) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Couldn't load interview overview"
        action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
      />
    );
  }
  const stats = [
    { label: "Open positions", value: overview.openJobs },
    { label: "Candidates", value: overview.totalCandidates },
    { label: "Interviews today", value: overview.interviewsToday },
    { label: "Pending evaluations", value: overview.pendingEvaluations },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold text-text">{s.value}</p>
              <p className="text-xs text-text-muted">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(overview.candidatesByStage).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(overview.candidatesByStage).map(([stage, count]) => (
                <Badge key={stage} variant="secondary">
                  {STAGE_LABELS[stage] ?? stage}: {count}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">No candidates in the pipeline yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JobsSection() {
  const { data: jobs, isLoading } = useJobOpenings();
  const { can } = usePermissions();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Job openings</CardTitle>
          <Badge variant="secondary">{jobs?.length ?? 0}</Badge>
        </div>
        {can("interview.job.create") ? <CreateJobDialog /> : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SectionSkeletonRows />
        ) : jobs && jobs.length > 0 ? (
          <div className="divide-y">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{j.title}</p>
                  <p className="truncate text-xs text-text-muted">{j.departmentName ?? "—"}</p>
                </div>
                <Badge variant={j.status === "open" ? "success" : "secondary"}>{j.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Briefcase} title="No job openings" />
        )}
      </CardContent>
    </Card>
  );
}

function CandidatesSection() {
  const { data: candidates, isLoading } = useCandidates();
  const { data: jobs } = useJobOpenings();
  const { can } = usePermissions();
  const canRunScreening = can("interview.screening.run");
  const canMakeDecision = can("interview.decision.make");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Candidates</CardTitle>
          <Badge variant="secondary">{candidates?.length ?? 0}</Badge>
        </div>
        {can("interview.candidate.create") ? <CreateCandidateDialog jobs={jobs ?? []} /> : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SectionSkeletonRows />
        ) : candidates && candidates.length > 0 ? (
          <div className="divide-y">
            {candidates.map((c) => (
              <div key={c.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text">{c.name}</p>
                    <p className="truncate text-xs text-text-muted">{c.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ResumeUploadButton candidateId={c.id} hasResume={Boolean(c.resumeFileId)} />
                    <Badge variant="secondary">{c.status}</Badge>
                  </div>
                </div>
                {c.applications && c.applications.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {c.applications.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-md border px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs text-text">
                            {a.jobOpening?.title ?? a.jobOpeningId}
                          </p>
                          <p className="text-xs text-text-muted">{a.stage}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {canRunScreening && <RunScreeningButton applicationId={a.id} />}
                          {canMakeDecision && (
                            <HiringDecisionButton applicationId={a.id} candidateName={c.name} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="No candidates" />
        )}
      </CardContent>
    </Card>
  );
}

function SessionsSection() {
  const { data: sessions, isLoading } = useInterviewSessions();
  const { data: candidates } = useCandidates();
  const { data: jobs } = useJobOpenings();
  const { can } = usePermissions();
  const canConduct = can("interview.interview.conduct");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Interview sessions</CardTitle>
          <Badge variant="secondary">{sessions?.length ?? 0}</Badge>
        </div>
        {can("interview.interview.schedule") ? (
          <CreateSessionDialog candidates={candidates ?? []} jobs={jobs ?? []} />
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SectionSkeletonRows />
        ) : sessions && sessions.length > 0 ? (
          <div className="divide-y">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{s.candidate?.name ?? "Interview"}</p>
                  <p className="truncate text-xs text-text-muted">
                    {s.jobOpening?.title ?? s.interviewType}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <Badge variant={s.status === "scheduled" ? "default" : "secondary"}>{s.status}</Badge>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : "Unscheduled"}
                    </p>
                  </div>
                  {canConduct && (
                    <AiInterviewButton sessionId={s.id} candidateName={s.candidate?.name} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarClock} title="No interview sessions" />
        )}
      </CardContent>
    </Card>
  );
}

function EvaluationsSection() {
  const { data: pending, isLoading } = usePendingEvaluations();
  const items = (pending ?? []) as Array<{
    id: string;
    session?: { candidate?: { name?: string }; jobOpening?: { title?: string } };
    createdAt?: string;
  }>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Pending evaluations</CardTitle>
        <Badge variant="secondary">{items.length}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SectionSkeletonRows />
        ) : items.length > 0 ? (
          <div className="divide-y">
            {items.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{e.session?.candidate?.name ?? "Interview"}</p>
                  <p className="truncate text-xs text-text-muted">{e.session?.jobOpening?.title ?? ""}</p>
                </div>
                <Badge variant="warning">pending</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={ClipboardCheck} title="No pending evaluations" />
        )}
      </CardContent>
    </Card>
  );
}

function SectionSkeletonRows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export function InterviewScreen() {
  const { can, hasPermissionPrefix } = usePermissions();
  const [tab, setTab] = useState<TabId>("overview");
  const { user } = usePermissions();
  const isCandidate = user?.dataScopes.some(
    (s) => (s.module === "interview" || s.module === "*") && s.scope === "own",
  );

  const hasAnyInterview =
    hasPermissionPrefix("interview.") || can("interview.access");

  if (!hasAnyInterview) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b px-6 py-4">
          <h1 className="text-xl font-semibold text-text">Interview</h1>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={ShieldAlert}
            title="You don't have access to the interview module"
            description="Ask an administrator to grant you an interview permission."
          />
        </div>
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => !t.permission || can(t.permission));
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id ?? "overview";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b px-6 pb-0 pt-4">
        <h1 className="text-xl font-semibold text-text">Interview</h1>
        <p className="text-sm text-text-secondary">
          {isCandidate
            ? "Your applications and interview schedule."
            : "Recruiting and interview management."}
        </p>
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                  activeTab === t.id
                    ? "border-primary font-medium text-text"
                    : "border-transparent text-text-muted hover:text-text",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "overview" && <OverviewSection />}
        {activeTab === "jobs" && (
          <SectionShell><JobsSection /></SectionShell>
        )}
        {activeTab === "candidates" && (
          <SectionShell><CandidatesSection /></SectionShell>
        )}
        {activeTab === "sessions" && (
          <SectionShell><SessionsSection /></SectionShell>
        )}
        {activeTab === "evaluations" && (
          <SectionShell><EvaluationsSection /></SectionShell>
        )}
        {activeTab === "templates" && (
          <SectionShell><TemplatesSection /></SectionShell>
        )}
      </div>
    </div>
  );
}
