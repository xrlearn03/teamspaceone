import { useEffect, useState } from "react";
import {
  BarChart3,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Scale,
  ShieldAlert,
  Users,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import {
  useHiringDecisions,
  useInterviewOverview,
  usePendingEvaluations,
} from "@/hooks/api";
import { TemplatesSection } from "@/components/interview/templates-panel";
import { TalentPool } from "@/components/interview/talent-pool";
import { JobsBoard } from "@/components/interview/jobs-board";
import { InterviewsBoard } from "@/components/interview/interviews-board";

type TabId = "overview" | "jobs" | "candidates" | "sessions" | "evaluations" | "decisions" | "templates";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  /** Visible when the user holds ANY of these permissions. */
  anyOf?: string[];
}

const TABS: Tab[] = [
  {
    id: "overview",
    label: "Overview",
    icon: BarChart3,
    anyOf: ["interview.job.view", "interview.candidate.view", "interview.interview.view"],
  },
  { id: "jobs", label: "Job openings", icon: Briefcase, permission: "interview.job.view" },
  { id: "candidates", label: "Candidates", icon: Users, permission: "interview.candidate.view" },
  { id: "sessions", label: "Sessions", icon: CalendarClock, permission: "interview.interview.view" },
  { id: "evaluations", label: "Evaluations", icon: ClipboardCheck, permission: "interview.interview.evaluate" },
  { id: "decisions", label: "Decisions", icon: Scale, permission: "interview.decision.view" },
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

function EvaluationsSection() {
  const { data: pending, isLoading } = usePendingEvaluations();
  const items = (pending ?? []) as Array<{
    id: string;
    status?: string;
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
                <Badge variant="warning">
                  {e.status === "ai_generated" ? "AI generated" : (e.status ?? "pending")}
                </Badge>
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

function DecisionsSection() {
  const { data: decisions, isLoading } = useHiringDecisions();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Hiring decisions</CardTitle>
          <Badge variant="secondary">{decisions?.length ?? 0}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SectionSkeletonRows />
        ) : decisions && decisions.length > 0 ? (
          <div className="divide-y">
            {decisions.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{d.application?.candidate?.name ?? "Candidate"}</p>
                  <p className="truncate text-xs text-text-muted">{d.application?.jobOpening?.title ?? d.applicationId}</p>
                </div>
                <Badge variant={d.decision === "hire" ? "success" : d.decision === "offer" ? "success" : d.decision === "reject" ? "error" : "secondary"}>
                  {d.decision}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Scale} title="No hiring decisions" />
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
  const interviewTab = useUIStore((s) => s.interviewTab);
  const [tab, setTab] = useState<TabId>("overview");

  // Deep-links (e.g. recruiter dashboard tabs) select the initial tab.
  useEffect(() => {
    if (interviewTab && TABS.some((t) => t.id === interviewTab)) {
      setTab(interviewTab as TabId);
    }
  }, [interviewTab]);

  const { user } = usePermissions();
  const isCandidate = user?.dataScopes.some(
    (s) => (s.module === "interview" || s.module === "*") && s.scope === "own",
  );

  const hasAnyInterview =
    hasPermissionPrefix("interview.") || can("interview.access");

  if (!hasAnyInterview) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b px-3 sm:px-6 py-4">
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

  const visibleTabs = TABS.filter(
    (t) => (!t.permission || can(t.permission)) && (!t.anyOf || t.anyOf.some((p) => can(p))),
  );
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id ?? "overview";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b px-3 sm:px-6 pb-0 pt-4">
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
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
        {activeTab === "overview" && <OverviewSection />}
        {activeTab === "jobs" && <JobsBoard />}
        {activeTab === "candidates" && <TalentPool />}
        {activeTab === "sessions" && <InterviewsBoard />}
        {activeTab === "evaluations" && (
          <SectionShell><EvaluationsSection /></SectionShell>
        )}
        {activeTab === "decisions" && (
          <SectionShell><DecisionsSection /></SectionShell>
        )}
        {activeTab === "templates" && (
          <SectionShell><TemplatesSection /></SectionShell>
        )}
      </div>
    </div>
  );
}
