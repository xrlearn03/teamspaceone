import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  Phone,
  Plus,
  Sparkles,
  Star,
  Users,
  Video,
} from "lucide-react";
import type { InterviewEvaluation, InterviewSession } from "@/lib/api";
import { getSessionEvaluations } from "@/lib/api";
import { useInterviewSessions, useJobOpenings, useMe } from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import { cn, getUserDisplayName } from "@/lib/utils";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import {
  CreateCandidateDialog,
  CreateJobDialog,
} from "@/components/interview/create-dialogs";
import { AiDailyBrief } from "@/components/ai-daily-brief";
import { QuickCheckInCard } from "@/features/dashboard/widgets";

/* =========================================================
   HELPERS
========================================================= */

/** Evaluation score fields averaged into the "Top Skills" bars. */
const SKILL_BARS = [
  { key: "technicalScore", label: "Technical Knowledge", color: "from-blue-500 to-blue-400" },
  { key: "communicationScore", label: "Communication", color: "from-violet-500 to-purple-400" },
  { key: "problemSolvingScore", label: "Problem Solving", color: "from-cyan-400 to-cyan-300" },
  { key: "cultureFitScore", label: "Culture Fit", color: "from-emerald-400 to-green-400" },
] as const;

type ScoreKey = (typeof SKILL_BARS)[number]["key"];

/** Backend scores are 0–100; the dashboard presents them as a 0–5 rating. */
function scoreToRating(score: number) {
  return score / 20;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function endTime(iso: string, durationMin: number) {
  return formatTime(new Date(new Date(iso).getTime() + durationMin * 60000).toISOString());
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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

function mean(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function monthBounds(offset: number): [number, number] {
  const now = new Date();
  return [
    new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime(),
    new Date(now.getFullYear(), now.getMonth() + offset + 1, 1).getTime(),
  ];
}

function avgInMonth(evals: InterviewEvaluation[], offset: number) {
  const [start, end] = monthBounds(offset);
  return mean(
    evals
      .filter((e) => {
        const t = new Date(e.createdAt).getTime();
        return e.overallScore != null && t >= start && t < end;
      })
      .map((e) => e.overallScore as number),
  );
}

type SessionTiming = "live" | "upcoming" | "ended" | "cancelled" | "unscheduled";

function sessionTiming(session: InterviewSession, now = new Date()): SessionTiming {
  if (session.status === "cancelled") return "cancelled";
  if (session.status === "completed") return "ended";
  if (!session.scheduledAt) return "unscheduled";
  const start = new Date(session.scheduledAt).getTime();
  const end = start + (session.durationMin || 60) * 60000;
  const t = now.getTime();
  if (t >= start && t <= end) return "live";
  if (t < start) return "upcoming";
  return "ended";
}

/** Catmull-Rom → cubic bezier for the feedback trend chart. */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x - 6} ${p.y} L ${p.x + 6} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* =========================================================
   REUSABLE UI
========================================================= */

function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ring-2 ring-border",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

function MetricCard({
  icon,
  iconClass,
  title,
  value,
  change,
  description,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  value: string;
  change?: { text: string; positive: boolean };
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition hover:border-primary/30">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl",
            iconClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-text-secondary">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-[27px] font-semibold tracking-tight text-text">
              {value}
            </span>
            {change && (
              <span
                className={cn(
                  "text-[13px] font-medium",
                  change.positive ? "text-success" : "text-error",
                )}
              >
                {change.text}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-[11px] text-text-muted">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  onAction,
  hint,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold text-text">{title}</h2>
        {action && (
          <button
            onClick={onAction}
            className="whitespace-nowrap text-[12px] font-medium text-primary transition hover:text-primary-hover"
          >
            {action}
          </button>
        )}
        {hint && (
          <span className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-[11px] text-text-secondary">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const TIMING_BADGE: Record<SessionTiming, { label: string; chip: string; dot: string } | null> = {
  live: { label: "Live Now", chip: "bg-info/15 text-info", dot: "bg-info" },
  upcoming: { label: "Upcoming", chip: "bg-mention/15 text-mention", dot: "bg-mention" },
  ended: { label: "Ended", chip: "bg-surface-elevated text-text-muted", dot: "bg-text-muted" },
  cancelled: { label: "Cancelled", chip: "bg-error/10 text-error", dot: "bg-error" },
  unscheduled: null,
};

function InterviewRow({
  session,
  timing,
  evaluated,
  canConduct,
  canEvaluate,
}: {
  session: InterviewSession;
  timing: SessionTiming;
  evaluated: boolean;
  canConduct: boolean;
  canEvaluate: boolean;
}) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const openSession = () =>
    setActiveView("ai-interview", { interviewSessionId: session.id });

  const badge = TIMING_BADGE[timing];
  const action =
    timing === "live" && canConduct
      ? { label: "Join", primary: true }
      : timing === "ended" && canEvaluate && !evaluated
        ? { label: "Add Feedback", primary: false }
        : timing === "cancelled"
          ? null
          : { label: "View Details", primary: false };

  return (
    <div className="relative flex min-h-[76px] items-center gap-4 rounded-xl px-1 py-2 transition hover:bg-primary/[0.04]">
      {/* Timeline dot */}
      <div className="relative z-10 flex w-6 shrink-0 justify-center">
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full border-2 border-surface",
            timing === "live"
              ? "bg-info shadow-[0_0_15px_rgba(34,211,238,.8)]"
              : timing === "ended" || timing === "cancelled"
                ? "bg-text-muted/50"
                : "bg-primary",
          )}
        />
      </div>

      {/* Time */}
      <div className="w-[95px] shrink-0">
        <p className="text-[16px] font-medium text-text">
          {formatTime(session.scheduledAt)}
        </p>
        <p className="mt-1 text-[11px] text-text-muted">{session.durationMin} min</p>
      </div>

      {/* Avatar */}
      <InitialsAvatar
        name={session.candidate?.name ?? "?"}
        className="h-12 w-12 text-[14px]"
      />

      {/* Person */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-text">
          {session.candidate?.name ?? "Candidate"}
        </p>
        <p className="mt-1 truncate text-[12px] text-text-muted">
          {session.jobOpening?.title ?? session.interviewType}
        </p>
      </div>

      {/* Status */}
      {badge && (
        <span
          className={cn(
            "hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] sm:inline-flex",
            badge.chip,
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", badge.dot)} />
          {badge.label}
        </span>
      )}

      {/* Action */}
      {action && (
        <button
          onClick={openSession}
          className={cn(
            "hidden h-11 w-[150px] shrink-0 items-center justify-center gap-2 rounded-lg text-[13px] font-medium md:flex",
            action.primary
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_8px_25px_rgba(37,99,235,.25)] transition hover:brightness-110"
              : "border border-primary/25 bg-surface-elevated text-text-secondary transition hover:border-primary/40 hover:text-text",
          )}
        >
          {action.primary && <Video size={15} />}
          {action.label}
        </button>
      )}
    </div>
  );
}

/* =========================================================
   MAIN
========================================================= */

export function RecruiterHomeScreen() {
  const { can } = usePermissions();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: user } = useMe();
  const userId = user?.id;

  const jobs = useJobOpenings();
  const sessions = useInterviewSessions();
  const upcomingQuery = useInterviewSessions(true);

  const canConduct = can("interview.interview.conduct");
  const canEvaluate = can("interview.interview.evaluate");

  const jobList = jobs.data ?? [];
  const sessionList = useMemo(() => sessions.data ?? [], [sessions.data]);

  /* Sessions the caller is actually a panel member of — "assigned" to them. */
  const mySessions = useMemo(
    () =>
      userId
        ? sessionList.filter((s) =>
            (s.participants ?? []).some((p) => p.userId === userId),
          )
        : [],
    [sessionList, userId],
  );

  /* Evaluations on the caller's sessions — one query per session, then keep
     only the ones they submitted. Member scope keeps this list small. */
  const evalQueries = useQueries({
    queries: mySessions.map((s) => ({
      queryKey: ["interview", "sessions", s.id, "evaluations"],
      queryFn: () => getSessionEvaluations(s.id),
      staleTime: 30 * 1000,
    })),
  });
  const evalsLoading = evalQueries.some((q) => q.isLoading);

  const myEvaluations = useMemo(
    () =>
      mySessions.flatMap((session, i) =>
        (evalQueries[i]?.data ?? [])
          .filter((e) => e.evaluatorId === userId)
          .map((e) => ({ ...e, session })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evalQueries, mySessions, userId],
  );

  const evaluatedSessionIds = useMemo(
    () => new Set(myEvaluations.map((e) => e.sessionId)),
    [myEvaluations],
  );

  /* ---------------- derived data ---------------- */
  const { todaySessions, completedToday, remainingToday } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const list = sessionList
      .filter((s) => {
        if (!s.scheduledAt) return false;
        const t = new Date(s.scheduledAt).getTime();
        return t >= start.getTime() && t < end.getTime();
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
      );
    const done = list.filter((s) => s.status === "completed").length;
    const cancelled = list.filter((s) => s.status === "cancelled").length;
    return {
      todaySessions: list,
      completedToday: done,
      remainingToday: list.length - done - cancelled,
    };
  }, [sessionList]);

  const nextSession = useMemo(
    () =>
      mySessions
        .filter((s) => s.status === "scheduled" && sessionTiming(s) === "upcoming")
        .sort(
          (a, b) =>
            new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
        )[0],
    [mySessions],
  );

  const pendingFeedback = useMemo(
    () =>
      mySessions.filter(
        (s) => sessionTiming(s) === "ended" && !evaluatedSessionIds.has(s.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mySessions, evaluatedSessionIds],
  );

  const ratedEvals = useMemo(
    () => myEvaluations.filter((e) => e.overallScore != null),
    [myEvaluations],
  );
  const avgScore = mean(ratedEvals.map((e) => e.overallScore as number));
  const avgRating = avgScore === null ? null : scoreToRating(avgScore);
  const thisMonthAvg = avgInMonth(ratedEvals, 0);
  const lastMonthAvg = avgInMonth(ratedEvals, -1);
  const ratingDelta =
    thisMonthAvg !== null && lastMonthAvg !== null
      ? scoreToRating(thisMonthAvg - lastMonthAvg)
      : null;

  const assignedMom = useMemo(() => {
    const [cs, ce] = monthBounds(0);
    const [ps, pe] = monthBounds(-1);
    const inRange = (s: InterviewSession, start: number, end: number) => {
      const t = new Date(s.createdAt).getTime();
      return t >= start && t < end;
    };
    const current = mySessions.filter((s) => inRange(s, cs, ce)).length;
    const previous = mySessions.filter((s) => inRange(s, ps, pe)).length;
    if (previous === 0) {
      return current > 0 ? { text: `↑ ${current} this month`, positive: true } : undefined;
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    return { text: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}%`, positive: pct >= 0 };
  }, [mySessions]);

  const feedbackThisMonth = useMemo(() => {
    const [start, end] = monthBounds(0);
    return myEvaluations.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= start && t < end;
    }).length;
  }, [myEvaluations]);

  /* ---------------- feedback trend (avg rating / month, last 6) ---------------- */
  const trend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() + i - 5, 1);
      const avg = avgInMonth(ratedEvals, i - 5);
      return {
        label: start.toLocaleDateString([], { month: "short" }),
        rating: avg === null ? null : scoreToRating(avg),
      };
    });
  }, [ratedEvals]);

  const CHART = { w: 460, top: 15, bottom: 195 };
  const xFor = (i: number) => 15 + i * ((CHART.w - 30) / 5);
  const yFor = (v: number) => CHART.bottom - (v / 5) * (CHART.bottom - CHART.top);
  const trendPoints = trend
    .map((m, i) => (m.rating === null ? null : { x: xFor(i), y: yFor(m.rating) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  const trendLine = smoothPath(trendPoints);
  const trendArea =
    trendPoints.length > 0
      ? `${trendLine} L ${trendPoints[trendPoints.length - 1].x} ${CHART.bottom} L ${trendPoints[0].x} ${CHART.bottom} Z`
      : "";

  /* ---------------- top skills ---------------- */
  const skills = useMemo(
    () =>
      SKILL_BARS.map((def) => ({
        ...def,
        value: Math.round(
          mean(
            myEvaluations
              .map((e) => e[def.key as ScoreKey])
              .filter((v): v is number => v != null),
          ) ?? 0,
        ),
      })),
    [myEvaluations],
  );

  /* ---------------- lists ---------------- */
  const upcomingSessions = useMemo(
    () => (upcomingQuery.data ?? []).filter((s) => s.scheduledAt).slice(0, 5),
    [upcomingQuery.data],
  );

  const recentFeedback = useMemo(
    () =>
      [...myEvaluations]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    [myEvaluations],
  );

  const displayName = getUserDisplayName(user, "there");
  const today = new Date().toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  /* ---------------- daily brief ---------------- */
  const briefFallback = useMemo(
    () => [
      `${todaySessions.length} interview${todaySessions.length === 1 ? "" : "s"} scheduled today — ${completedToday} completed · ${remainingToday} upcoming.`,
      nextSession
        ? `Next interview at ${formatTime(nextSession.scheduledAt)} — ${nextSession.candidate?.name ?? "Candidate"} · ${nextSession.jobOpening?.title ?? "Interview"}.`
        : "No upcoming interviews — you're all caught up.",
      `${pendingFeedback.length} feedback form${pendingFeedback.length === 1 ? "" : "s"} pending — complete evaluations after your interviews.`,
      avgRating === null
        ? "No ratings submitted yet across your evaluations."
        : `Average rating is ${avgRating.toFixed(1)} / 5${
            ratingDelta !== null
              ? ` — ${ratingDelta >= 0 ? "up" : "down"} ${Math.abs(ratingDelta).toFixed(1)} vs last month`
              : " across your submitted evaluations"
          }.`,
    ],
    [todaySessions.length, completedToday, remainingToday, nextSession, pendingFeedback.length, avgRating, ratingDelta],
  );

  const briefRecommendation = useMemo(() => {
    if (pendingFeedback.length > 0) {
      return `Complete the ${pendingFeedback.length} pending evaluation${pendingFeedback.length === 1 ? "" : "s"} while the conversations are still fresh.`;
    }
    if (nextSession) {
      return `Prepare for your next interview at ${formatTime(nextSession.scheduledAt)} with ${nextSession.candidate?.name ?? "the candidate"}.`;
    }
    return "Nothing urgent right now — review open roles and keep the pipeline moving.";
  }, [pendingFeedback.length, nextSession]);

  const stats = [
    {
      icon: <CalendarDays size={29} />,
      iconClass: "bg-info/10 text-info",
      title: "Today's Interviews",
      value: String(todaySessions.length),
      description: `${completedToday} completed  ·  ${remainingToday} upcoming`,
    },
    {
      icon: <Users size={29} />,
      iconClass: "bg-success/10 text-success",
      title: "Total Assigned",
      value: String(mySessions.length),
      change: assignedMom,
      description: "vs last month",
    },
    {
      icon: <FileText size={29} />,
      iconClass: "bg-mention/10 text-mention",
      title: "Feedback Submitted",
      value: String(myEvaluations.length),
      change:
        feedbackThisMonth > 0
          ? { text: `↑ ${feedbackThisMonth}`, positive: true }
          : undefined,
      description: feedbackThisMonth > 0 ? "this month" : "",
    },
    {
      icon: <Star size={29} />,
      iconClass: "bg-warning/10 text-warning",
      title: "Average Rating Given",
      value: avgRating === null ? "—" : `${avgRating.toFixed(1)} / 5`,
      change:
        ratingDelta !== null
          ? {
              text: `${ratingDelta >= 0 ? "↑" : "↓"} ${Math.abs(ratingDelta).toFixed(1)}`,
              positive: ratingDelta >= 0,
            }
          : undefined,
      description: "vs last month",
    },
  ];

  const goSessions = () => setActiveView("interview", { interviewTab: "sessions" });
  const goEvaluations = () =>
    setActiveView("interview", { interviewTab: "evaluations" });

  return (
    <div className="relative h-full w-full overflow-y-auto bg-background text-text">
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[150px]" />
        <div className="absolute -right-40 -top-20 h-[500px] w-[500px] rounded-full bg-info/10 blur-[150px]" />
        <div className="absolute bottom-[-250px] left-[30%] h-[500px] w-[500px] rounded-full bg-mention/10 blur-[160px]" />
      </div>

      <main className="relative mx-auto max-w-[1500px] px-5 py-6 xl:px-7">
        {/* =================================================
            HEADER
        ================================================= */}
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-[30px] font-bold tracking-[-0.04em] text-text sm:text-[32px]">
              {getGreeting()}, {displayName}!
            </h1>
            <p className="mt-1 text-[16px] text-text-secondary">
              Here’s your interview overview for today.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-left lg:text-right">
              <p className="text-[13px] text-text-secondary">{today}</p>
              <p className="mt-1 text-[14px] italic leading-6 text-text-muted">
                “Great interviews
                <br />
                build great teams.”
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {can("interview.job.create") && (
                <CreateJobDialog
                  trigger={
                    <button className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-primary-hover">
                      <Plus size={16} />
                      Post a New Job
                    </button>
                  }
                />
              )}
              {can("interview.candidate.create") && (
                <CreateCandidateDialog
                  jobs={jobList}
                  trigger={
                    <button className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-[13px] font-semibold text-primary transition hover:border-primary/40">
                      <Plus size={16} />
                      Add Candidate
                    </button>
                  }
                />
              )}
            </div>
          </div>
        </header>

        {/* =================================================
            AI DAILY BRIEF
        ================================================= */}
        <section className="mt-6 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <AiDailyBrief
            subtitle="Your personalized interview update for today"
            fallbackPoints={briefFallback}
            recommendation={briefRecommendation}
          />
          <QuickCheckInCard />
        </section>

        {/* =================================================
            KPI CARDS
        ================================================= */}
        <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sessions.isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[110px] rounded-xl" />
              ))
            : stats.map((s) => <MetricCard key={s.title} {...s} />)}
        </section>

        {/* =================================================
            CONTENT GRID
        ================================================= */}
        <section className="mt-5 grid gap-5 xl:grid-cols-[1.85fr_0.95fr]">
          {/* ============ LEFT COLUMN ============ */}
          <div className="space-y-5">
            {/* Today's interviews */}
            <Panel title="Today's Interviews" action="View Calendar  →" onAction={goSessions}>
              {sessions.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[76px] rounded-xl" />
                  ))}
                </div>
              ) : todaySessions.length === 0 ? (
                <p className="py-10 text-center text-xs text-text-muted">
                  No interviews scheduled for today.
                </p>
              ) : (
                <div className="relative">
                  {/* timeline */}
                  <div className="absolute bottom-5 left-[12px] top-5 w-px bg-gradient-to-b from-info via-primary to-mention" />
                  <div className="space-y-1">
                    {todaySessions.map((session) => (
                      <InterviewRow
                        key={session.id}
                        session={session}
                        timing={sessionTiming(session)}
                        evaluated={evaluatedSessionIds.has(session.id)}
                        canConduct={canConduct}
                        canEvaluate={canEvaluate}
                      />
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            {/* Analytics */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Feedback trend */}
              <Panel title="Interview Feedback Trend" hint="Last 6 months">
                {trendPoints.length === 0 ? (
                  <p className="flex h-[235px] items-center justify-center text-center text-xs text-text-muted">
                    No evaluation scores yet.
                  </p>
                ) : (
                  <div className="relative h-[235px]">
                    {[0, 1, 2, 3, 4, 5].map((v) => (
                      <div
                        key={v}
                        className="absolute inset-x-0 border-t border-border"
                        style={{ top: yFor(v) }}
                      />
                    ))}

                    <div className="absolute left-0 top-0 flex h-[210px] flex-col justify-between text-[10px] text-text-muted">
                      {[5, 4, 3, 2, 1, 0].map((v) => (
                        <span key={v}>{v}</span>
                      ))}
                    </div>

                    <svg
                      viewBox={`0 0 ${CHART.w} 220`}
                      className="absolute left-7 top-0 h-[220px] w-[calc(100%-30px)]"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient
                          id="feedbackFill"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#7c3aed" stopOpacity=".30" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity=".02" />
                        </linearGradient>
                        <linearGradient id="feedbackLine" x1="0" x2="1">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                      </defs>

                      {trendArea && (
                        <path d={trendArea} fill="url(#feedbackFill)" />
                      )}
                      {trendLine && (
                        <path
                          d={trendLine}
                          fill="none"
                          stroke="url(#feedbackLine)"
                          strokeWidth="3"
                        />
                      )}
                      {trendPoints.map((p, index) => (
                        <circle
                          key={index}
                          cx={p.x}
                          cy={p.y}
                          r="5"
                          fill="var(--color-surface, #172554)"
                          stroke="#a78bfa"
                          strokeWidth="2"
                        />
                      ))}
                    </svg>

                    {avgRating !== null && (
                      <div className="absolute right-0 top-0 rounded-lg border border-mention/20 bg-mention/20 px-4 py-2 text-center">
                        <p className="text-[18px] font-semibold text-text">
                          {avgRating.toFixed(1)}
                        </p>
                        <p className="text-[10px] text-mention">Avg. Rating</p>
                      </div>
                    )}

                    <div className="absolute bottom-0 left-8 right-0 flex justify-between text-[11px] text-text-muted">
                      {trend.map((m) => (
                        <span key={m.label}>{m.label}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              {/* Top skills */}
              <Panel title="Top Skills Evaluated" hint="All time">
                {evalsLoading ? (
                  <div className="space-y-6 pt-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 rounded-lg" />
                    ))}
                  </div>
                ) : myEvaluations.length === 0 ? (
                  <p className="flex h-[235px] items-center justify-center text-center text-xs text-text-muted">
                    Submit evaluations to see your skill breakdown.
                  </p>
                ) : (
                  <div className="space-y-6 pt-2">
                    {skills.map((skill) => (
                      <div key={skill.label}>
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] text-text-secondary">
                            {skill.label}
                          </span>
                          <span className="text-[12px] text-text-secondary">
                            {skill.value}%
                          </span>
                        </div>
                        <div className="mt-2 h-3 rounded-full bg-surface-elevated">
                          <div
                            className={cn(
                              "h-full rounded-full bg-gradient-to-r",
                              skill.color,
                            )}
                            style={{ width: `${skill.value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* ============ RIGHT COLUMN ============ */}
          <div className="space-y-5">
            {/* Upcoming */}
            <Panel title="Upcoming Interviews" action="View All  →" onAction={goSessions}>
              {upcomingQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : upcomingSessions.length === 0 ? (
                <p className="py-8 text-center text-xs text-text-muted">
                  No interviews scheduled.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {upcomingSessions.map((session) => {
                    const date = new Date(session.scheduledAt!);
                    const isPhone = session.interviewType
                      ?.toLowerCase()
                      .includes("phone");
                    return (
                      <button
                        key={session.id}
                        onClick={() =>
                          setActiveView("ai-interview", {
                            interviewSessionId: session.id,
                          })
                        }
                        className="flex w-full items-center gap-3 py-3.5 text-left transition hover:bg-primary/[0.04]"
                      >
                        <div className="flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                          <span className="text-[9px] font-semibold uppercase text-text-muted">
                            {date.toLocaleDateString([], { month: "short" })}
                          </span>
                          <span className="text-[16px] font-semibold text-text">
                            {date.getDate()}
                          </span>
                        </div>

                        <InitialsAvatar
                          name={session.candidate?.name ?? "?"}
                          className="h-10 w-10 text-[12px] ring-1"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-text">
                            {session.candidate?.name ?? "Candidate"}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-text-muted">
                            {session.jobOpening?.title ?? "Interview"}
                          </p>
                        </div>

                        <div className="hidden text-right sm:block">
                          <p className="whitespace-nowrap text-[10px] text-text-muted">
                            {formatTime(session.scheduledAt)} –{" "}
                            {endTime(session.scheduledAt!, session.durationMin)}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-info">
                            {isPhone ? <Phone size={11} /> : <Video size={11} />}
                            {isPhone ? "Phone" : "Video"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Recent feedback */}
            <Panel
              title="Recent Feedback"
              action="View All  →"
              onAction={goEvaluations}
            >
              {evalsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : recentFeedback.length === 0 ? (
                <p className="py-8 text-center text-xs text-text-muted">
                  No feedback submitted yet.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {recentFeedback.map((item) => {
                    const rating = scoreToRating(item.overallScore ?? 0);
                    const filled = Math.round(rating);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 py-3.5"
                      >
                        <InitialsAvatar
                          name={item.session?.candidate?.name ?? "?"}
                          className="h-10 w-10 text-[12px] ring-1"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-text">
                            {item.session?.candidate?.name ?? "Candidate"}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-text-muted">
                            {item.session?.jobOpening?.title ?? "Interview"}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-0.5">
                            {[0, 1, 2, 3, 4].map((star) => (
                              <span
                                key={star}
                                className={cn(
                                  "text-[14px]",
                                  star < filled
                                    ? "text-warning"
                                    : "text-border",
                                )}
                              >
                                ★
                              </span>
                            ))}
                            <span className="ml-1 text-[12px] text-text">
                              {rating.toFixed(1)}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] text-text-muted">
                            {timeAgo(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </section>
      </main>
    </div>
  );
}
