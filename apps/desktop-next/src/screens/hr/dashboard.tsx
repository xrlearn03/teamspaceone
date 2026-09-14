import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  Plane,
  Send,
  Sparkles,
  Target,
  Ticket,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useAttendanceAll,
  useAttendanceCorrections,
  useDailyDigest,
  useEmployees,
  useHrmsAnalytics,
  useHrmsOverview,
  useLeaveRequests,
  useMe,
  usePayrollPeriods,
  usePerformanceReviews,
  useReviewCycles,
  useTickets,
  useTodos,
} from "@/hooks/api";
import { getActiveOrganisation, type DailyDigestResult, type Employee, type LeaveRequest } from "@/lib/api";
import { normalizeDigest } from "@/features/dashboard/widgets";
import { useUIStore, type View } from "@/stores/ui";
import { cn, getUserDisplayName } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { SectionError, SectionSkeleton, formatDate } from "@/screens/hrms/common";
import { DATE_RANGE_OPTIONS, FilterDropdown, withinDateRange } from "./common";

/* =========================================================
   HELPERS
========================================================= */

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function dayKey(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function initials(name?: string | null) {
  return (name ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function employeeName(e: Employee) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function plural(n: number, singular: string, pluralForm?: string) {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

function shortDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function dateRangeLabel(start?: string | null, end?: string | null) {
  if (!start) return "—";
  if (!end || dayKey(start) === dayKey(end)) return shortDate(start);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

const LEAVE_COLORS = ["var(--info)", "var(--success)", "var(--warning)", "var(--mention)", "var(--primary)", "var(--text-muted)"];
const AVATAR_CLASSES = [
  "bg-info/10 text-info",
  "bg-success/10 text-success",
  "bg-primary/10 text-primary",
  "bg-mention/10 text-mention",
  "bg-warning/10 text-warning",
];

/* =========================================================
   SHARED PIECES
========================================================= */

function Card({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-5 shadow-[0_3px_18px_rgba(20,50,90,.035)]", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <h2 className="truncate text-base font-semibold text-text">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ViewAllLink({ onClick, label = "View All" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {label}
      <ArrowRight size={13} />
    </button>
  );
}

function DonutChart({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  centerValue: string | number;
  centerLabel: string;
}) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let accumulated = 0;

  return (
    <div className="relative h-[150px] w-[150px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--surface-elevated)" strokeWidth="13" />
        {total > 0 &&
          segments.map((segment, index) => {
            const length = (segment.value / total) * circumference;
            const offset = circumference - accumulated - length;
            accumulated += length;
            if (length <= 0) return null;
            return (
              <circle
                key={index}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="13"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className="text-[25px] font-semibold text-text">{centerValue}</span>
        <span className="mt-0.5 text-[10px] leading-tight text-text-muted">{centerLabel}</span>
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">{label}</span>
      <span className="text-xs font-medium text-text">{value}</span>
    </div>
  );
}

/* =========================================================
   AI DAILY BRIEF
========================================================= */

const BRIEF_DOT_COLORS = ["bg-mention", "bg-warning", "bg-info", "bg-success", "bg-primary"];

function AiDailyBrief({
  fallbackPoints,
  recommendation,
}: {
  fallbackPoints: string[];
  recommendation: string;
}) {
  const dailyDigest = useDailyDigest();
  const [digest, setDigest] = useState<DailyDigestResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (digest || failed) return;
    dailyDigest
      .mutateAsync({ hours: 24 })
      .then((result) => setDigest(normalizeDigest(result)))
      .catch(() => {
        setFailed(true);
        setDigest(normalizeDigest(null));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digest, failed]);

  const digestPoints = useMemo(
    () => (digest?.sections ?? []).flatMap((s) => s.items).filter(Boolean).slice(0, 5),
    [digest],
  );
  const usableDigest = digestPoints.filter((p) => !/failed to load|no activity to summarize/i.test(p));
  const points = usableDigest.length > 0 ? usableDigest : fallbackPoints;

  return (
    <div className="relative min-h-[310px] overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-surface via-primary-subtle/60 to-info/10 p-6">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-info/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-[-40px] h-56 w-96 rotate-[-18deg] rounded-[50%] bg-primary/10 blur-2xl" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[21px] font-semibold text-text">AI Daily Brief</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                Beta
              </span>
            </div>
            <p className="mt-1 text-xs text-text-secondary">Key updates and actions for today</p>
          </div>
        </div>

        {/* AI insights */}
        <div className="mt-5 space-y-3">
          {dailyDigest.isPending && fallbackPoints.length === 0 ? (
            <p className="text-[13px] leading-5 text-text-secondary">Generating daily brief…</p>
          ) : points.length > 0 ? (
            points.map((point, index) => (
              <div key={index} className="flex items-start gap-4">
                <span
                  className={cn(
                    "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                    BRIEF_DOT_COLORS[index % BRIEF_DOT_COLORS.length],
                  )}
                />
                <p className="text-[13px] leading-5 text-text-secondary">{point}</p>
              </div>
            ))
          ) : (
            <p className="text-[13px] leading-5 text-text-secondary">You're all caught up — nothing needs attention.</p>
          )}
        </div>

        {/* Bottom */}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 rounded-lg border border-primary/30 bg-surface/80 px-5 py-2.5 text-xs font-medium text-primary transition hover:bg-surface"
          >
            {expanded ? "Hide Details" : "View Details"}
            {expanded ? <X size={14} /> : <ArrowRight size={14} />}
          </button>
        </div>

        {/* Expanded AI analysis */}
        {expanded && (
          <div className="mt-4 max-h-44 space-y-3 overflow-y-auto rounded-xl border border-primary/15 bg-surface/80 p-4 text-xs leading-5 text-text-secondary">
            <p>
              <strong className="text-text">AI recommendation:</strong> {recommendation}
            </p>
            {digest?.sections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-semibold text-text">{section.title}</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   QUICK ACTIONS
========================================================= */

function QuickActions() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const actions: { title: string; icon: LucideIcon; className: string; view: View; hrmsTab?: string }[] = [
    { title: "Approve Leave", icon: CalendarCheck, className: "bg-mention/10 text-mention hover:bg-mention/20", view: "leaves" },
    { title: "Run Payroll", icon: Wallet, className: "bg-primary/10 text-primary hover:bg-primary/20", view: "payroll" },
    { title: "Start Review Cycle", icon: BarChart3, className: "bg-info/10 text-info hover:bg-info/20", view: "hrms", hrmsTab: "performance" },
    { title: "Add Employee", icon: UserPlus, className: "bg-success/10 text-success hover:bg-success/20", view: "employees" },
    { title: "Manage Policies", icon: FileText, className: "bg-warning/10 text-warning hover:bg-warning/20", view: "leaves" },
    { title: "View Reports", icon: BarChart3, className: "bg-primary/10 text-primary hover:bg-primary/20", view: "hrms", hrmsTab: "analytics" },
  ];

  return (
    <Card
      title="Quick Actions"
      icon={
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <TrendingUp size={19} />
        </div>
      }
    >
      <div className="mt-4 grid grid-cols-3 gap-3">
        {actions.map((action) => (
          <button
            key={action.title}
            type="button"
            onClick={() => setActiveView(action.view, action.hrmsTab ? { hrmsTab: action.hrmsTab } : undefined)}
            className={cn(
              "flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-lg px-1 transition",
              action.className,
            )}
          >
            <action.icon size={21} />
            <span className="text-center text-[10px] font-medium leading-tight text-text">{action.title}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* =========================================================
   KPI CARD
========================================================= */

function KpiCard({
  icon,
  iconClass,
  title,
  value,
  delta,
  footer,
  onClick,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  value: number | string;
  delta?: { label: string; up: boolean } | null;
  footer: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-surface p-4 text-left shadow-[0_3px_18px_rgba(20,50,90,.035)] transition hover:border-primary/40 hover:shadow-[0_6px_24px_rgba(20,50,90,.08)]"
    >
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconClass)}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-text-secondary">{title}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[24px] font-semibold tracking-tight text-text">{value}</span>
            {delta && (
              <span className={cn("flex items-center gap-0.5 text-[10px] font-medium", delta.up ? "text-success" : "text-error")}>
                {delta.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {delta.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="mt-1 text-right text-[10px] text-text-muted">{footer}</p>
    </button>
  );
}

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export function HrDashboardScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: user } = useMe();
  const organisationId = getActiveOrganisation() ?? undefined;
  const [range, setRange] = useState("30d");

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const employees = useEmployees();
  const overview = useHrmsOverview();
  const analytics = useHrmsAnalytics();
  const leaveRequests = useLeaveRequests();
  const corrections = useAttendanceCorrections("pending");
  const attendanceWeek = useAttendanceAll({ from: weekAgo, to: today });
  const tickets = useTickets(organisationId);
  const cycles = useReviewCycles();
  const reviews = usePerformanceReviews();
  const todos = useTodos();
  const payrollPeriods = usePayrollPeriods();

  /* ---------- derived data ---------- */

  const empList = employees.data ?? [];
  const headcount = overview.data?.totalEmployees ?? analytics.data?.headcount ?? empList.length;

  const leaveList = leaveRequests.data ?? [];
  const pendingLeaves = useMemo(
    () => leaveList.filter((r) => r.status === "pending" || r.status === "manager_approved"),
    [leaveList],
  );
  const onLeaveToday = useMemo(
    () =>
      leaveList.filter(
        (r) => r.status === "approved" && dayKey(r.startDate) !== null && dayKey(r.startDate)! <= today && dayKey(r.endDate)! >= today,
      ),
    [leaveList, today],
  );

  const pendingCorrections = useMemo(
    () => (corrections.data ?? []).filter((c) => (c.status ?? "pending") === "pending"),
    [corrections.data],
  );
  const pendingApprovals = pendingLeaves.length + pendingCorrections.length;

  const ticketList = tickets.data ?? [];
  const openTickets = useMemo(() => ticketList.filter((t) => t.status !== "solved"), [ticketList]);

  const activeCycle = useMemo(() => {
    const list = cycles.data ?? [];
    return (
      [...list].filter((c) => c.status === "active").sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""))[0] ??
      [...list].filter((c) => c.status !== "closed").sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""))[0] ??
      null
    );
  }, [cycles.data]);

  const cycleReviews = useMemo(
    () => (reviews.data ?? []).filter((r) => (activeCycle ? r.cycle?.id === activeCycle.id : true)),
    [reviews.data, activeCycle],
  );
  const reviewStats = useMemo(() => {
    const completed = cycleReviews.filter((r) => r.status === "acknowledged").length;
    const submitted = cycleReviews.filter((r) => r.status === "submitted").length;
    const pending = cycleReviews.filter((r) => r.status !== "acknowledged" && r.status !== "submitted").length;
    return { completed, submitted, pending, total: cycleReviews.length };
  }, [cycleReviews]);

  const attendanceByDay = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of attendanceWeek.data ?? []) {
      const key = dayKey(a.date);
      if (!key) continue;
      const present =
        Boolean(a.checkInAt) || ["present", "late", "wfh", "half_day", "remote"].includes((a.status ?? "").toLowerCase());
      if (!present) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(a.employeeId);
    }
    return map;
  }, [attendanceWeek.data]);

  const weekTrend = useMemo(() => {
    const days: { key: string; label: string; pct: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const present = attendanceByDay.get(key)?.size ?? 0;
      days.push({
        key,
        label: d.toLocaleDateString([], { weekday: "short" }),
        pct: headcount > 0 ? Math.round((present / headcount) * 100) : 0,
      });
    }
    return days;
  }, [attendanceByDay, headcount]);

  const todayPct = weekTrend[weekTrend.length - 1]?.pct ?? 0;

  const leaveByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of onLeaveToday) {
      const name = r.leaveTypeName ?? "Leave";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()].map(([label, value], i) => ({
      label,
      value,
      color: LEAVE_COLORS[i % LEAVE_COLORS.length],
    }));
  }, [onLeaveToday]);

  const openTodos = useMemo(
    () =>
      (todos.data ?? [])
        .filter((t) => !t.completedAt)
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
        .slice(0, 4),
    [todos.data],
  );

  const recentHires = analytics.data?.recentHires ?? 0;
  const upcomingReviews = analytics.data?.lifecycle.upcomingReviews ?? reviewStats.total;

  const latestPayroll = useMemo(
    () => [...(payrollPeriods.data ?? [])].sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""))[0] ?? null,
    [payrollPeriods.data],
  );

  /* ---------- people activity feed ---------- */

  interface ActivityItem {
    id: string;
    name: string;
    text: string;
    ts: string;
  }

  const activity = useMemo(() => {
    const items: ActivityItem[] = [];
    for (const e of empList) {
      const ts = e.joiningDate ?? e.createdAt;
      if (ts) items.push({ id: `join-${e.id}`, name: employeeName(e), text: "joined the company", ts });
    }
    for (const r of leaveList) {
      if (!r.createdAt) continue;
      const verb =
        r.status === "approved"
          ? "had a leave request approved"
          : r.status === "rejected"
            ? "had a leave request rejected"
            : "submitted a leave request";
      items.push({ id: `leave-${r.id}`, name: r.employeeName ?? "Someone", text: verb, ts: r.createdAt });
    }
    for (const r of reviews.data ?? []) {
      if (!r.submittedAt) continue;
      items.push({
        id: `review-${r.id}`,
        name: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
        text: "submitted a performance review",
        ts: r.submittedAt,
      });
    }
    return items
      .filter((i) => withinDateRange(i.ts, range))
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empList, leaveList, reviews.data, range]);

  /* ---------- AI brief fallback points ---------- */

  const briefFallback = useMemo(() => {
    const points: string[] = [];
    if (pendingApprovals > 0) points.push(`${plural(pendingApprovals, "request")} need${pendingApprovals === 1 ? "s" : ""} your approval.`);
    if (onLeaveToday.length > 0) points.push(`${plural(onLeaveToday.length, "employee")} ${onLeaveToday.length === 1 ? "is" : "are"} on leave today.`);
    if (activeCycle) points.push(`Review cycle "${activeCycle.name}" is in progress (${plural(reviewStats.pending + reviewStats.submitted, "review")} open).`);
    if (latestPayroll) points.push(`Payroll "${latestPayroll.name ?? "current period"}" is ${latestPayroll.status}.`);
    if (headcount > 0) points.push(`Team attendance is ${todayPct}% today.`);
    return points.slice(0, 5);
  }, [pendingApprovals, onLeaveToday.length, activeCycle, reviewStats, latestPayroll, headcount, todayPct]);

  const briefRecommendation = useMemo(() => {
    const parts: string[] = [];
    if (pendingApprovals > 0) parts.push(`prioritize the ${plural(pendingApprovals, "pending approval")}`);
    const openReviews = reviewStats.pending + reviewStats.submitted;
    if (activeCycle && openReviews > 0)
      parts.push(`review the ${plural(openReviews, "outstanding review")} in "${activeCycle.name}"`);
    if (latestPayroll && latestPayroll.status !== "paid")
      parts.push(`complete the ${latestPayroll.name ?? "current period"} payroll review`);
    if (parts.length === 0)
      return "Nothing urgent right now — keep an eye on attendance trends and the next review cycle.";
    const sentence = parts.join(", ").replace(/, ([^,]*)$/, ", and $1");
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
  }, [pendingApprovals, activeCycle, reviewStats, latestPayroll]);

  /* ---------- render ---------- */

  const displayName = getUserDisplayName(user, "there");
  const todayLabel = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="h-full overflow-y-auto bg-background text-text">
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-7">
        {/* HEADER */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-text">
              {getGreeting()}, {displayName}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">Here's what you need to know about your people today.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-text-secondary lg:flex">
              <CalendarDays size={16} />
              {todayLabel}
            </div>
            <FilterDropdown value={range} onChange={setRange} options={DATE_RANGE_OPTIONS} />
          </div>
        </header>

        {/* HERO */}
        <section className="mt-5 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <AiDailyBrief fallbackPoints={briefFallback} recommendation={briefRecommendation} />
          <QuickActions />
        </section>

        {/* KPI CARDS */}
        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            icon={<Users size={21} />}
            iconClass="bg-info/10 text-info"
            title="Total Employees"
            value={employees.isLoading ? "…" : headcount}
            delta={recentHires > 0 ? { label: `+${recentHires}`, up: true } : null}
            footer="recent hires"
            onClick={() => setActiveView("employees")}
          />
          <KpiCard
            icon={<Plane size={21} />}
            iconClass="bg-mention/10 text-mention"
            title="On Leave Today"
            value={leaveRequests.isLoading ? "…" : onLeaveToday.length}
            footer="approved for today"
            onClick={() => setActiveView("leaves")}
          />
          <KpiCard
            icon={<Clock3 size={21} />}
            iconClass="bg-success/10 text-success"
            title="Attendance Rate"
            value={attendanceWeek.isLoading ? "…" : `${todayPct}%`}
            footer={`${attendanceByDay.get(today)?.size ?? 0} present today`}
            onClick={() => setActiveView("my-attendance")}
          />
          <KpiCard
            icon={<Ticket size={21} />}
            iconClass="bg-error/10 text-error"
            title="Open Tickets (HR)"
            value={tickets.isLoading ? "…" : openTickets.length}
            footer="awaiting resolution"
            onClick={() => setActiveView("tickets")}
          />
          <KpiCard
            icon={<BarChart3 size={21} />}
            iconClass="bg-primary/10 text-primary"
            title="Upcoming Reviews"
            value={analytics.isLoading ? "…" : upcomingReviews}
            footer={activeCycle ? `in ${activeCycle.name}` : "no active cycle"}
            onClick={() => setActiveView("my-performance")}
          />
          <KpiCard
            icon={<FileText size={21} />}
            iconClass="bg-warning/10 text-warning"
            title="Pending Approvals"
            value={leaveRequests.isLoading ? "…" : pendingApprovals}
            footer="need action"
            onClick={() => setActiveView("leaves")}
          />
        </section>

        {/* ANALYTICS */}
        <section className="mt-4 grid gap-4 xl:grid-cols-3">
          {/* Leave Overview */}
          <Card
            title="Leave Overview"
            icon={<CalendarDays size={19} className="text-primary" />}
            action={<ViewAllLink onClick={() => setActiveView("leaves")} />}
          >
            {leaveRequests.isLoading ? (
              <SectionSkeleton rows={3} />
            ) : leaveRequests.isError ? (
              <SectionError onRetry={() => leaveRequests.refetch()} />
            ) : (
              <div className="mt-3 flex items-center gap-6">
                <DonutChart
                  centerValue={onLeaveToday.length}
                  centerLabel="On Leave Today"
                  segments={leaveByType.map((t) => ({ value: t.value, color: t.color }))}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  {leaveByType.length > 0 ? (
                    leaveByType.map((item) => <LegendRow key={item.label} color={item.color} label={item.label} value={item.value} />)
                  ) : (
                    <p className="text-xs text-text-muted">Nobody is on leave today.</p>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Attendance Trend */}
          <Card
            title="Attendance Trend"
            icon={<TrendingUp size={19} className="text-primary" />}
            action={<ViewAllLink label="View Report" onClick={() => setActiveView("my-attendance")} />}
          >
            {attendanceWeek.isLoading ? (
              <SectionSkeleton rows={3} />
            ) : attendanceWeek.isError ? (
              <SectionError onRetry={() => attendanceWeek.refetch()} />
            ) : (
              <div className="mt-5 flex h-[150px] items-end justify-between gap-2 px-2">
                {weekTrend.map((item) => (
                  <div key={item.key} className="flex h-full flex-1 flex-col items-center justify-end">
                    <span className="mb-2 text-[10px] font-medium text-text-secondary">{item.pct}%</span>
                    <div
                      className="w-full max-w-[32px] rounded-t-md bg-gradient-to-t from-primary to-primary/40"
                      style={{ height: `${Math.max(4, item.pct)}%` }}
                    />
                    <span className="mt-3 text-[10px] text-text-muted">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Performance Cycle */}
          <Card
            title="Performance Cycle"
            icon={<Target size={19} className="text-primary" />}
            action={<ViewAllLink onClick={() => setActiveView("my-performance")} />}
          >
            {reviews.isLoading || cycles.isLoading ? (
              <SectionSkeleton rows={3} />
            ) : reviews.isError || cycles.isError ? (
              <SectionError onRetry={() => { reviews.refetch(); cycles.refetch(); }} />
            ) : !activeCycle ? (
              <p className="py-8 text-center text-xs text-text-muted">No active review cycle.</p>
            ) : (
              <div className="mt-3 flex items-center gap-6">
                <DonutChart
                  centerValue={reviewStats.total > 0 ? `${Math.round(((reviewStats.completed + reviewStats.submitted) / reviewStats.total) * 100)}%` : "0%"}
                  centerLabel="Completed"
                  segments={[
                    { value: reviewStats.completed, color: "var(--success)" },
                    { value: reviewStats.submitted, color: "var(--info)" },
                    { value: reviewStats.pending, color: "var(--warning)" },
                  ]}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="truncate text-[11px] font-medium text-text-secondary">{activeCycle.name}</p>
                  <LegendRow color="var(--success)" label="Completed" value={reviewStats.completed} />
                  <LegendRow color="var(--info)" label="Submitted" value={reviewStats.submitted} />
                  <LegendRow color="var(--warning)" label="Pending" value={reviewStats.pending} />
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* BOTTOM */}
        <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.9fr_1fr]">
          {/* Pending Approvals */}
          <Card
            title="Pending Approvals"
            icon={<FileText size={19} className="text-primary" />}
            action={<ViewAllLink onClick={() => setActiveView("leaves")} />}
          >
            {leaveRequests.isLoading || corrections.isLoading ? (
              <SectionSkeleton rows={3} />
            ) : leaveRequests.isError ? (
              <SectionError onRetry={() => leaveRequests.refetch()} />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-y border-border bg-surface-elevated/80">
                      <th className="px-2 py-3 text-left text-[10px] font-medium text-text-secondary">#</th>
                      <th className="px-2 py-3 text-left text-[10px] font-medium text-text-secondary">Type</th>
                      <th className="px-2 py-3 text-left text-[10px] font-medium text-text-secondary">Employee</th>
                      <th className="px-2 py-3 text-left text-[10px] font-medium text-text-secondary">Dates</th>
                      <th className="px-2 py-3 text-left text-[10px] font-medium text-text-secondary">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingLeaves.slice(0, 3).map((r: LeaveRequest) => (
                      <tr
                        key={r.id}
                        onClick={() => setActiveView("leaves")}
                        className="cursor-pointer border-b border-border transition hover:bg-primary-subtle/40"
                      >
                        <td className="px-2 py-3 text-[10px] font-medium text-text-secondary">
                          LV-{r.id.replace(/-/g, "").slice(-4).toUpperCase()}
                        </td>
                        <td className="px-2 py-3 text-[10px] text-text-secondary">{r.leaveTypeName ?? "Leave"}</td>
                        <td className="px-2 py-3 text-[10px] font-medium text-text">{r.employeeName ?? "—"}</td>
                        <td className="px-2 py-3 text-[10px] text-text-muted">{dateRangeLabel(r.startDate, r.endDate)}</td>
                        <td className="px-2 py-3">
                          <span className="rounded-full bg-warning/10 px-3 py-1.5 text-[10px] font-medium capitalize text-warning">
                            {r.status === "manager_approved" ? "Awaiting HR" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {pendingCorrections.slice(0, Math.max(0, 3 - Math.min(3, pendingLeaves.length))).map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setActiveView("my-attendance")}
                        className="cursor-pointer border-b border-border transition hover:bg-primary-subtle/40"
                      >
                        <td className="px-2 py-3 text-[10px] font-medium text-text-secondary">
                          AC-{c.id.replace(/-/g, "").slice(-4).toUpperCase()}
                        </td>
                        <td className="px-2 py-3 text-[10px] text-text-secondary">Attendance Correction</td>
                        <td className="px-2 py-3 text-[10px] font-medium text-text">{c.employeeName ?? "—"}</td>
                        <td className="px-2 py-3 text-[10px] text-text-muted">{shortDate(c.date)}</td>
                        <td className="px-2 py-3">
                          <span className="rounded-full bg-warning/10 px-3 py-1.5 text-[10px] font-medium text-warning">
                            Pending
                          </span>
                        </td>
                      </tr>
                    ))}
                    {pendingLeaves.length === 0 && pendingCorrections.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-xs text-text-muted">
                          Nothing waiting for approval.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Upcoming HR Tasks */}
          <Card
            title="Upcoming HR Tasks"
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
                <ClipboardCheck size={16} />
              </div>
            }
          >
            {todos.isLoading ? (
              <SectionSkeleton rows={3} />
            ) : todos.isError ? (
              <SectionError onRetry={() => todos.refetch()} />
            ) : openTodos.length === 0 ? (
              <p className="py-8 text-center text-xs text-text-muted">No open tasks.</p>
            ) : (
              <div className="mt-3">
                {openTodos.map((task) => {
                  const title = task.title.toLowerCase();
                  const meta = title.includes("payroll")
                    ? { icon: Wallet, cls: "bg-info/10 text-info" }
                    : title.includes("review") || title.includes("performance")
                      ? { icon: ClipboardCheck, cls: "bg-success/10 text-success" }
                      : title.includes("policy") || title.includes("document")
                        ? { icon: FileText, cls: "bg-warning/10 text-warning" }
                        : title.includes("survey") || title.includes("send")
                          ? { icon: Send, cls: "bg-primary/10 text-primary" }
                          : { icon: CalendarDays, cls: "bg-surface-elevated text-text-secondary" };
                  return (
                    <div key={task.id} className="flex w-full items-center gap-3 border-b border-border py-2.5 last:border-0">
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.cls)}>
                        <meta.icon size={15} />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-text">{task.title}</span>
                      <span className="shrink-0 text-[10px] text-text-muted">
                        {task.dueDate ? formatDate(task.dueDate) : "No date"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Recent People Activity */}
          <Card
            title="Recent People Activity"
            icon={<Users size={19} className="text-primary" />}
            action={<ViewAllLink onClick={() => setActiveView("employees")} />}
          >
            {employees.isLoading || leaveRequests.isLoading ? (
              <SectionSkeleton rows={3} />
            ) : activity.length === 0 ? (
              <p className="py-8 text-center text-xs text-text-muted">No recent people activity.</p>
            ) : (
              <div className="mt-3">
                {activity.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className={cn("text-[10px] font-semibold", AVATAR_CLASSES[index % AVATAR_CLASSES.length])}>
                        {initials(item.name)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
                      <span className="font-semibold text-text">{item.name}</span> {item.text}
                    </p>
                    <span className="shrink-0 text-[10px] text-text-muted">{formatRelative(item.ts)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
