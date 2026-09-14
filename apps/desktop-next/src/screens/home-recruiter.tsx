import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Filter,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Users,
  Video,
  X,
} from "lucide-react";
import type {
  Candidate,
  HiringDecision,
  InterviewSession,
} from "@/lib/api";
import {
  useCandidates,
  useHiringDecisions,
  useInterviewOverview,
  useInterviewSessions,
  useJobOpenings,
  usePendingEvaluations,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import {
  CreateCandidateDialog,
  CreateJobDialog,
} from "@/components/interview/create-dialogs";

/* =========================================================
   HELPERS
========================================================= */

/** Board columns mapped onto backend application stages. */
const PIPELINE_STAGES = [
  { key: "applied", label: "Applied", match: ["applied"], chip: "bg-surface-elevated text-text-secondary" },
  { key: "screening", label: "Screening", match: ["screening", "shortlisted"], chip: "bg-info/10 text-info" },
  { key: "interview", label: "Interview", match: ["interview", "evaluation"], chip: "bg-mention/10 text-mention" },
  { key: "offer", label: "Offer", match: ["offer"], chip: "bg-success/10 text-success" },
  { key: "hired", label: "Hired", match: ["hired"], chip: "bg-success/10 text-success" },
] as const;

type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

const BAR_COLORS = ["bg-info", "bg-primary", "bg-mention", "bg-warning", "bg-success"];

function stageKeyFor(raw?: string | null): PipelineStageKey | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  for (const stage of PIPELINE_STAGES) {
    if ((stage.match as readonly string[]).includes(normalized)) return stage.key;
  }
  return null;
}

/** The application that places a candidate on the board (latest, or the one for the selected job). */
function activeApplication(candidate: Candidate, jobId: string | null) {
  const apps = candidate.applications ?? [];
  const scoped = jobId ? apps.filter((a) => a.jobOpeningId === jobId) : apps;
  if (scoped.length === 0) return null;
  return [...scoped].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isToday(iso?: string | null) {
  return Boolean(iso) && new Date(iso as string).toDateString() === new Date().toDateString();
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon,
  value,
  label,
  note,
  iconClass,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  note: string;
  iconClass: string;
}) {
  return (
    <div className="min-w-[185px] flex-1 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-text-muted">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-text">{value}</div>
          <div className="mt-1 text-[10px] font-medium text-text-muted">{note}</div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CANDIDATE CARD
========================================================= */

function CandidateCard({
  candidate,
  jobId,
}: {
  candidate: Candidate;
  jobId: string | null;
}) {
  const application = activeApplication(candidate, jobId);
  const stageKey = stageKeyFor(application?.stage ?? candidate.status);
  const stage = PIPELINE_STAGES.find((s) => s.key === stageKey);

  return (
    <div className="group rounded-xl border border-border bg-surface p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {initials(candidate.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="truncate text-xs font-semibold text-text">{candidate.name}</div>
          </div>
          <div className="mt-1 truncate text-[10px] text-text-muted">
            {application?.jobOpening?.title ?? candidate.email}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {stage && (
              <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold", stage.chip)}>
                {application?.stage ?? candidate.status}
              </span>
            )}
            {candidate.source && (
              <span className="inline-flex rounded-md bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-text-muted">
                {candidate.source}
              </span>
            )}
          </div>
          <div className="mt-2 text-[10px] text-text-muted">{timeAgo(candidate.createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PIPELINE COLUMN
========================================================= */

function PipelineColumn({
  stage,
  candidates,
  jobId,
  addCandidate,
}: {
  stage: (typeof PIPELINE_STAGES)[number];
  candidates: Candidate[];
  jobId: string | null;
  addCandidate?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[200px] flex-1 flex-col rounded-xl bg-surface-elevated/60">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[11px] font-semibold text-text">{stage.label}</span>
        <span className="text-[11px] font-semibold text-text-muted">{candidates.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {candidates.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} jobId={jobId} />
        ))}
        {candidates.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-2 py-4 text-center text-[10px] text-text-muted">
            No candidates
          </p>
        )}
        {addCandidate}
      </div>
    </div>
  );
}

/* =========================================================
   TODAY'S SCHEDULE
========================================================= */

function SchedulePanel({ sessions }: { sessions: InterviewSession[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const todays = useMemo(
    () =>
      sessions
        .filter((s) => isToday(s.scheduledAt))
        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
        .slice(0, 5),
    [sessions],
  );

  return (
    <aside className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Today's Schedule</h3>
        <button
          onClick={() => setActiveView("interview", { interviewTab: "sessions" })}
          className="text-xs font-medium text-primary"
        >
          View All
        </button>
      </div>

      {todays.length === 0 ? (
        <p className="mt-5 text-xs text-text-muted">No interviews scheduled for today.</p>
      ) : (
        <div className="mt-4">
          {todays.map((item, index) => (
            <div key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < todays.length - 1 && (
                <span className="absolute left-[72px] top-5 h-full w-px bg-border" />
              )}
              <div className="w-[62px] shrink-0">
                <div className="text-[11px] font-semibold text-text">{formatTime(item.scheduledAt)}</div>
                <div className="mt-1 text-[10px] text-text-muted">{item.durationMin} min</div>
              </div>
              <div className="relative flex min-w-0 flex-1 gap-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-text">
                    Interview — {item.candidate?.name ?? "Candidate"}
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-text-muted">
                    {item.jobOpening?.title ?? "Interview session"}
                  </div>
                  {item.interviewType && (
                    <div className="text-[10px] text-text-muted">({item.interviewType})</div>
                  )}
                </div>
                <button
                  onClick={() => setActiveView("interview", { interviewTab: "sessions" })}
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  {item.interviewType?.toLowerCase().includes("phone") ? (
                    <Phone size={13} />
                  ) : (
                    <Video size={13} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

/* =========================================================
   RECENT ACTIVITY
========================================================= */

type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  at: string;
};

function decisionLabel(decision: string) {
  switch (decision) {
    case "hire":
      return "hired";
    case "offer":
      return "offer extended";
    case "reject":
      return "rejected";
    default:
      return `marked ${decision}`;
  }
}

function RecentActivity({
  candidates,
  decisions,
}: {
  candidates: Candidate[];
  decisions: HiringDecision[];
}) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const items = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = candidates.map((c) => ({
      id: `c-${c.id}`,
      title: `${c.name} applied`,
      subtitle: c.applications?.[0]?.jobOpening?.title ?? c.source ?? "Candidate",
      at: c.createdAt,
    }));
    for (const d of decisions) {
      list.push({
        id: `d-${d.id}`,
        title: `${d.application?.candidate?.name ?? "Candidate"} — ${decisionLabel(d.decision)}`,
        subtitle: d.application?.jobOpening?.title ?? "Hiring decision",
        at: d.createdAt,
      });
    }
    return list
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 5);
  }, [candidates, decisions]);

  return (
    <aside className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Recent Activity</h3>
        <button
          onClick={() => setActiveView("interview")}
          className="text-xs font-medium text-primary"
        >
          View All
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {items.length === 0 && (
          <p className="text-xs text-text-muted">No recent activity yet.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mention/10 text-mention">
              <Users size={15} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-text">{item.title}</div>
              <div className="mt-1 truncate text-[10px] text-text-muted">
                {item.subtitle} · {timeAgo(item.at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* =========================================================
   TALENT POOL
========================================================= */

function TalentPool({ total }: { total: number }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <aside className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Talent Pool</h3>
        <button
          onClick={() => setActiveView("interview", { interviewTab: "candidates" })}
          className="text-xs font-medium text-primary"
        >
          View All
        </button>
      </div>
      <button
        onClick={() => setActiveView("interview", { interviewTab: "candidates" })}
        className="mt-4 flex w-full items-center gap-3 text-left"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mention/10 text-mention">
          <Users size={20} />
        </div>
        <div>
          <div className="text-xl font-semibold text-text">{total}</div>
          <div className="text-[10px] text-text-muted">Candidates in pool</div>
        </div>
        <ChevronRight size={16} className="ml-auto text-text-muted" />
      </button>
    </aside>
  );
}

/* =========================================================
   HIRING PIPELINE CHART
========================================================= */

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

const STAGE_ORDER = [
  "applied",
  "screening",
  "shortlisted",
  "interview",
  "evaluation",
  "offer",
  "hired",
  "rejected",
];

function HiringPipelineChart({ byStage }: { byStage: Record<string, number> }) {
  const bars = STAGE_ORDER.filter((s) => (byStage[s] ?? 0) > 0).map((s) => ({
    name: STAGE_LABELS[s] ?? s,
    value: byStage[s],
  }));
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-text">Hiring Pipeline</h3>
      {bars.length === 0 ? (
        <p className="mt-6 text-xs text-text-muted">No candidates in the pipeline yet.</p>
      ) : (
        <div className="mt-4 flex h-[120px] items-end justify-between gap-3 border-b border-border px-2">
          {bars.map((bar, i) => (
            <div key={bar.name} className="flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[10px] font-semibold text-text-muted">{bar.value}</span>
              <div
                className={cn("w-full max-w-[38px] rounded-t-md", BAR_COLORS[i % BAR_COLORS.length])}
                style={{ height: `${Math.max(6, (bar.value / max) * 78)}px` }}
              />
              <span className="mt-2 truncate text-[9px] text-text-muted">{bar.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   PENDING EVALUATIONS
========================================================= */

function PendingEvaluations() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: pending, isLoading } = usePendingEvaluations();
  const items = (pending ?? []) as Array<{
    id: string;
    status?: string;
    session?: { candidate?: { name?: string }; jobOpening?: { title?: string } };
  }>;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Pending Evaluations</h3>
        <button
          onClick={() => setActiveView("interview", { interviewTab: "evaluations" })}
          className="text-xs font-medium text-primary"
        >
          Review
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-2xl font-semibold text-text">
          {isLoading ? "—" : items.length}
        </span>
        {items.length > 0 && (
          <span className="rounded-md bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">
            awaiting feedback
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] text-text-muted">Interview evaluations to submit or review</div>

      <div className="mt-3 space-y-2">
        {items.slice(0, 3).map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-[11px]">
            <ClipboardCheck size={12} className="shrink-0 text-text-muted" />
            <span className="truncate text-text">{e.session?.candidate?.name ?? "Interview"}</span>
            <span className="ml-auto shrink-0 text-[10px] text-text-muted">
              {e.session?.jobOpening?.title ?? ""}
            </span>
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <p className="text-[11px] text-text-muted">Nothing waiting on you.</p>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   SOURCE BREAKDOWN
========================================================= */

const SOURCE_COLORS = ["#6366f1", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#94a3b8"];

function SourceBreakdown({ candidates }: { candidates: Candidate[] }) {
  const segments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of candidates) {
      const key = c.source?.trim() || "Other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4).reduce((acc, [, n]) => acc + n, 0);
    const entries = rest > 0 ? [...top, ["Other", rest] as [string, number]] : top;
    const total = Math.max(
      1,
      entries.reduce((acc, [, n]) => acc + n, 0),
    );
    let cursor = 0;
    return {
      total,
      entries: entries.map(([name, count], i) => {
        const start = cursor;
        cursor += (count / total) * 100;
        return { name, count, pct: Math.round((count / total) * 100), start, end: cursor, color: SOURCE_COLORS[i % SOURCE_COLORS.length] };
      }),
    };
  }, [candidates]);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-text">Source Breakdown</h3>
      {candidates.length === 0 ? (
        <p className="mt-6 text-xs text-text-muted">No candidate sources yet.</p>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <div
            className="relative h-[100px] w-[100px] shrink-0 rounded-full"
            style={{
              background: `conic-gradient(${segments.entries
                .map((e) => `${e.color} ${e.start}% ${e.end}%`)
                .join(", ")})`,
            }}
          >
            <div className="absolute inset-[21px] flex items-center justify-center rounded-full bg-surface">
              <div className="text-center">
                <div className="text-base font-semibold text-text">{candidates.length}</div>
                <div className="text-[9px] text-text-muted">Candidates</div>
              </div>
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            {segments.entries.map((e) => (
              <div key={e.name} className="flex items-center gap-2 text-[10px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />
                <span className="w-[80px] truncate text-text-muted">{e.name}</span>
                <strong className="text-text-secondary">{e.pct}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MAIN
========================================================= */

const DASH_TABS: { label: string; interviewTab?: string }[] = [
  { label: "Candidates" },
  { label: "Job Requisitions", interviewTab: "jobs" },
  { label: "Interviews", interviewTab: "sessions" },
  { label: "Offers", interviewTab: "decisions" },
  { label: "Talent Pool", interviewTab: "candidates" },
];

export function RecruiterHomeScreen() {
  const { can } = usePermissions();
  const setActiveView = useUIStore((s) => s.setActiveView);

  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);

  const overview = useInterviewOverview();
  const jobs = useJobOpenings();
  const candidates = useCandidates();
  const sessions = useInterviewSessions(true);
  const canSeeDecisions = can("interview.decision.view");
  const decisions = useHiringDecisions(canSeeDecisions);

  const jobList = jobs.data ?? [];
  const candidateList = candidates.data ?? [];
  const byStage = overview.data?.candidatesByStage ?? {};
  const selectedJob = jobList.find((j) => j.id === jobId) ?? null;

  const sources = useMemo(
    () =>
      [...new Set(candidateList.map((c) => c.source?.trim()).filter(Boolean))].sort() as string[],
    [candidateList],
  );

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = candidateList.filter((candidate) => {
      if (q && !`${candidate.name} ${candidate.email}`.toLowerCase().includes(q)) return false;
      if (sourceFilter && (candidate.source?.trim() ?? "") !== sourceFilter) return false;
      const application = activeApplication(candidate, jobId);
      const key = stageKeyFor(application?.stage ?? candidate.status);
      if (jobId && !application) return false;
      if (stageFilter && key !== stageFilter) return false;
      return key !== null;
    });
    result = [...result].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortNewest ? -diff : diff;
    });
    return result;
  }, [candidateList, search, sourceFilter, stageFilter, jobId, sortNewest]);

  const candidatesByStage = (key: PipelineStageKey) =>
    filteredCandidates.filter((candidate) => {
      const application = activeApplication(candidate, jobId);
      return stageKeyFor(application?.stage ?? candidate.status) === key;
    });

  const stats = [
    {
      icon: <BriefcaseBusiness size={20} />,
      value: overview.data?.openJobs ?? jobList.filter((j) => j.status === "open").length,
      label: "Open Positions",
      note: `${jobList.length} job${jobList.length === 1 ? "" : "s"} listed`,
      iconClass: "bg-info/10 text-info",
    },
    {
      icon: <Users size={20} />,
      value: overview.data?.totalCandidates ?? candidateList.length,
      label: "Total Candidates",
      note: "Across all openings",
      iconClass: "bg-success/10 text-success",
    },
    {
      icon: <CalendarDays size={20} />,
      value: overview.data?.interviewsToday ?? 0,
      label: "Interviews Today",
      note: `${overview.data?.upcomingInterviews ?? 0} upcoming`,
      iconClass: "bg-mention/10 text-mention",
    },
    {
      icon: <FileText size={20} />,
      value: byStage.offer ?? 0,
      label: "Offers Extended",
      note: "Awaiting response",
      iconClass: "bg-warning/10 text-warning",
    },
    {
      icon: <CheckCircle2 size={20} />,
      value: byStage.hired ?? 0,
      label: "Hired",
      note: "All time",
      iconClass: "bg-success/10 text-success",
    },
  ];

  const addCandidateTrigger = (className: string) =>
    can("interview.candidate.create") ? (
      <CreateCandidateDialog
        jobs={jobList}
        trigger={
          <button className={className}>
            <Plus size={13} />
            Add Candidate
          </button>
        }
      />
    ) : null;

  return (
    <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-y-auto bg-background px-5 py-5 text-text">
      {/* =================================================
          HEADER
      ================================================= */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Recruiter Panel</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Find great people. Build amazing teams.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("interview.job.create") && (
            <CreateJobDialog
              trigger={
                <button className="flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-hover">
                  <Plus size={15} />
                  Create Job
                </button>
              }
            />
          )}
          {addCandidateTrigger(
            "flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-xs font-semibold text-primary transition hover:border-primary/40",
          )}
          <button
            onClick={() => setActiveView("interview")}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text-muted"
            title="Open interview workspace"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </header>

      {/* =================================================
          KPI CARDS
      ================================================= */}
      <section className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {overview.isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px] min-w-[185px] flex-1 rounded-xl" />
            ))
          : stats.map((s) => <StatCard key={s.label} {...s} value={String(s.value)} />)}
      </section>

      {/* =================================================
          CONTENT GRID
      ================================================= */}
      <div className="mt-4 grid gap-4 pb-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          {/* Tabs + controls */}
          <div className="flex flex-col gap-3 border-b border-border pb-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex overflow-x-auto">
              {DASH_TABS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() =>
                    tab.interviewTab
                      ? setActiveView("interview", { interviewTab: tab.interviewTab })
                      : undefined
                  }
                  className={cn(
                    "relative whitespace-nowrap px-4 py-3 text-xs font-medium",
                    tab.interviewTab ? "text-text-muted hover:text-text" : "font-semibold text-primary",
                  )}
                >
                  {tab.label}
                  {!tab.interviewTab && (
                    <span className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-9 w-[220px] items-center gap-2 rounded-lg border border-border bg-surface px-3">
                <Search size={14} className="text-text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full bg-transparent text-xs outline-none placeholder:text-text-muted"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-text-muted">
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilter(!showFilter)}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold",
                  showFilter
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface text-text-secondary",
                )}
              >
                <Filter size={14} />
                Filter
              </button>
              <button
                onClick={() => setSortNewest(!sortNewest)}
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text-secondary"
              >
                <ArrowUpDown size={13} />
                {sortNewest ? "Newest" : "Oldest"}
              </button>
            </div>
          </div>

          {/* Filter row */}
          {showFilter && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
              <span className="text-xs font-semibold text-text-muted">Filter by:</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary"
              >
                <option value="">All stages</option>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary"
              >
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setStageFilter("");
                  setSourceFilter("");
                  setShowFilter(false);
                }}
                className="ml-auto text-xs font-semibold text-primary"
              >
                Clear
              </button>
            </div>
          )}

          {/* Job heading */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex items-center">
                <select
                  value={jobId ?? ""}
                  onChange={(e) => setJobId(e.target.value || null)}
                  className="h-9 appearance-none rounded-lg border border-transparent bg-transparent pr-7 text-base font-semibold text-text outline-none"
                >
                  <option value="">All openings</option>
                  {jobList.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-1 text-text-muted" />
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary">
                {filteredCandidates.length} candidate{filteredCandidates.length === 1 ? "" : "s"}
              </span>
              {selectedJob?.departmentName && (
                <span className="rounded-full bg-surface-elevated px-3 py-1 text-[10px] font-medium text-text-muted">
                  {selectedJob.departmentName}
                </span>
              )}
              {selectedJob && (
                <Badge variant={selectedJob.status === "open" ? "success" : "secondary"}>
                  {selectedJob.status}
                </Badge>
              )}
            </div>
            <button
              onClick={() => setActiveView("interview", { interviewTab: "jobs" })}
              className="text-xs font-semibold text-primary"
            >
              View Details
            </button>
          </div>

          {/* Pipeline */}
          <div className="mt-3 overflow-x-auto pb-2">
            {candidates.isLoading ? (
              <div className="flex min-w-[1020px] gap-2">
                {PIPELINE_STAGES.map((s) => (
                  <Skeleton key={s.key} className="h-[280px] min-w-[200px] flex-1 rounded-xl" />
                ))}
              </div>
            ) : candidates.isError ? (
              <EmptyState
                icon={ShieldAlert}
                title="Couldn't load candidates"
                action={
                  <Button variant="secondary" size="sm" onClick={() => candidates.refetch()}>
                    Retry
                  </Button>
                }
              />
            ) : (
              <div className="flex min-w-[1020px] gap-2">
                {PIPELINE_STAGES.map((stage) => (
                  <PipelineColumn
                    key={stage.key}
                    stage={stage}
                    candidates={candidatesByStage(stage.key)}
                    jobId={jobId}
                    addCandidate={addCandidateTrigger(
                      "mt-auto flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-border bg-surface text-[11px] font-semibold text-primary transition hover:border-primary/40",
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Analytics */}
          <div className="mt-1 grid gap-3 md:grid-cols-3">
            <HiringPipelineChart byStage={byStage} />
            <PendingEvaluations />
            <SourceBreakdown candidates={candidateList} />
          </div>
        </section>

        {/* Right sidebar */}
        <aside className="space-y-4">
          <SchedulePanel sessions={sessions.data ?? []} />
          <RecentActivity
            candidates={candidateList}
            decisions={canSeeDecisions ? (decisions.data ?? []) : []}
          />
          <TalentPool total={overview.data?.totalCandidates ?? candidateList.length} />
        </aside>
      </div>
    </div>
  );
}
