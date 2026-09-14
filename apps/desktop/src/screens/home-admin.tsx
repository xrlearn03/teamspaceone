import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  Clock3,
  Coffee,
  DoorOpen,
  Hash,
  ListTodo,
  LogIn,
  LogOut,
  Package,
  Plus,
  ShieldAlert,
  Sparkles,
  Ticket,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useAssets,
  useAttendance,
  useAttendanceCheckin,
  useAttendanceCheckout,
  useAttendancePresence,
  useAuditEvents,
  useChannels,
  useCreateTodo,
  useDailyDigest,
  useDeleteTodo,
  useMe,
  useMeetings,
  useMembers,
  useMyEmployee,
  useNotifications,
  useOffboardingCases,
  useOnboardingInstances,
  useTickets,
  useTimeEntries,
  useTodos,
  useUpdateTodo,
  useUsers,
} from "../hooks/api";
import { PermissionGate } from "@teamspace-one/authorization/react";
import { usePermissions } from "../hooks/usePermissions";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { getActiveOrganisation, type AuditEvent, type DailyDigestResult, type TimeEntry } from "../lib/api";
import { normalizeDigest } from "../features/dashboard/widgets";
import { useUIStore, type View } from "../stores/ui";
import { cn, getUserDisplayName } from "../lib/utils";
import { DATE_RANGE_OPTIONS, FilterDropdown, withinDateRange } from "./hr/common";
import { formatDate, SectionError, SectionSkeleton } from "./hrms/common";

/* =========================================================
   HELPERS
========================================================= */

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

/** % change between the current and previous window, given creation dates. */
function deltaPercent(dates: string[], windowDays: number) {
  const now = Date.now();
  const current = dates.filter((d) => new Date(d).getTime() >= now - windowDays * 86400000).length;
  const previous = dates.filter((d) => {
    const ts = new Date(d).getTime();
    return ts < now - windowDays * 86400000 && ts >= now - 2 * windowDays * 86400000;
  }).length;
  if (previous === 0) return current > 0 ? { label: "+100%", up: true } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, up: pct > 0 };
}

function plural(n: number, singular: string, pluralForm?: string) {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/* =========================================================
   AUDIT ACTIVITY RENDERING
========================================================= */

const ACTIVITY_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  "user.created": { icon: UserPlus, className: "bg-info/10 text-info" },
  "organisation.member_added": { icon: UserPlus, className: "bg-info/10 text-info" },
  "organisation.member_invited": { icon: UserPlus, className: "bg-info/10 text-info" },
  "ticket.created": { icon: AlertCircle, className: "bg-error/10 text-error" },
  "ticket.status_changed": { icon: Ticket, className: "bg-warning/10 text-warning" },
  "hrms.leave.approved": { icon: UserCheck, className: "bg-success/10 text-success" },
  "hrms.leave.rejected": { icon: X, className: "bg-error/10 text-error" },
  "hrms.leave.requested": { icon: CalendarDays, className: "bg-warning/10 text-warning" },
  "hrms.employee.created": { icon: UserPlus, className: "bg-info/10 text-info" },
  "meeting.created": { icon: CalendarDays, className: "bg-primary/10 text-primary" },
  "meeting.started": { icon: CalendarDays, className: "bg-success/10 text-success" },
  "meeting.ended": { icon: CalendarDays, className: "bg-surface-elevated text-text-muted" },
  "channel.created": { icon: Hash, className: "bg-primary/10 text-primary" },
  "project.created": { icon: Package, className: "bg-primary/10 text-primary" },
  "task.completed": { icon: CheckCircle2, className: "bg-success/10 text-success" },
  "user.signed_in": { icon: ShieldAlert, className: "bg-info/10 text-info" },
  "user.password_reset_requested": { icon: ShieldAlert, className: "bg-warning/10 text-warning" },
};

function describeAuditEvent(event: AuditEvent, actorName: string): string {
  const kind = event.eventType.replace(/^teamspace-one\./, "");
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : null);
  switch (kind) {
    case "user.created": {
      const name = [str("firstName"), str("lastName")].filter(Boolean).join(" ") || str("email");
      return name ? `${actorName} created a user account for ${name}` : `${actorName} created a user account`;
    }
    case "organisation.member_added":
      return `${actorName} added a member to the organisation`;
    case "organisation.member_invited":
      return `${actorName} invited ${str("email") ?? "a new member"} to the organisation`;
    case "ticket.created":
      return `${actorName} raised a ${str("priority") ?? ""} priority ticket${str("subject") ? ` (${str("subject")})` : ""}`.replace("  ", " ");
    case "ticket.status_changed":
      return `${actorName} marked ticket${str("subject") ? ` "${str("subject")}"` : ""} as ${str("status") ?? "updated"}`;
    case "hrms.leave.approved":
      return `${actorName} approved a leave request`;
    case "hrms.leave.rejected":
      return `${actorName} rejected a leave request`;
    case "hrms.leave.requested":
      return `${actorName} requested leave`;
    case "hrms.employee.created":
      return `${actorName} added a new employee`;
    case "meeting.created":
      return `${actorName} scheduled a meeting${str("title") ? ` "${str("title")}"` : ""}`;
    case "meeting.started":
      return `${actorName} started a meeting`;
    case "meeting.ended":
      return `${actorName} ended a meeting`;
    case "channel.created":
      return `${actorName} created a channel${str("name") ? ` #${str("name")}` : ""}`;
    case "project.created":
      return `${actorName} created a project${str("name") ? ` "${str("name")}"` : ""}`;
    case "task.completed":
      return `${actorName} completed a task${str("title") ? ` "${str("title")}"` : ""}`;
    case "user.signed_in":
      return `${actorName} signed in`;
    case "user.password_reset_requested":
      return `Password reset requested for ${str("email") ?? "a user"}`;
    default:
      return `${actorName} · ${kind.replace(/[._]/g, " ")}`;
  }
}

/* =========================================================
   DONUT CHART
========================================================= */

function DonutChart({
  values,
  total,
  centerTitle,
  centerValue,
}: {
  values: { value: number; color: string }[];
  total: number;
  centerTitle: string;
  centerValue?: string | number;
}) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <div className="relative h-[145px] w-[145px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--surface-elevated)" strokeWidth="13" />
        {total > 0 &&
          values.map((item, index) => {
            const length = (item.value / total) * circumference;
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
                stroke={item.color}
                strokeWidth="13"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className="text-[25px] font-semibold text-text">{centerValue ?? total}</span>
        <span className="text-[10px] leading-tight text-text-muted">{centerTitle}</span>
      </div>
    </div>
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
      className="rounded-xl border border-border bg-surface px-5 py-4 text-left shadow-[0_3px_18px_rgba(20,50,90,.035)] transition hover:border-primary/40 hover:shadow-[0_6px_24px_rgba(20,50,90,.08)]"
    >
      <div className="flex items-center gap-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", iconClass)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-text-secondary">{title}</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[25px] font-semibold tracking-tight text-text">{value}</span>
            {delta && (
              <span
                className={cn(
                  "flex items-center gap-1 text-[11px] font-medium",
                  delta.up ? "text-success" : "text-error",
                )}
              >
                {delta.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {delta.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-right text-[10px] text-text-muted">{footer}</p>
    </button>
  );
}

/* =========================================================
   CARD SHELL
========================================================= */

function DashboardCard({
  title,
  icon,
  badge,
  onViewAll,
  className,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  onViewAll?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-[0_3px_18px_rgba(20,50,90,.035)]",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {badge}
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-xs font-medium text-primary hover:underline">
            View All
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/* =========================================================
   AI DAILY BRIEF
========================================================= */

const BRIEF_DOT_COLORS = ["bg-success", "bg-error", "bg-info", "bg-warning", "bg-primary"];

function AiDailyBrief() {
  const setActiveView = useUIStore((s) => s.setActiveView);
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

  const points = useMemo(
    () => (digest?.sections ?? []).flatMap((s) => s.items).filter(Boolean).slice(0, 5),
    [digest],
  );

  return (
    <div className="relative min-h-[310px] overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-surface via-primary-subtle/50 to-info/10 p-6">
      <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-info/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-[-40px] h-56 w-96 rotate-[-18deg] rounded-[50%] bg-primary/10 blur-2xl" />

      <div className="relative z-10">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
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

        <div className="mt-5 space-y-3">
          {dailyDigest.isPending ? (
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
            <p className="text-[13px] leading-5 text-text-secondary">
              No activity to summarize. You're all caught up.
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 rounded-lg border border-primary/30 bg-surface/80 px-5 py-2.5 text-xs font-medium text-primary transition hover:bg-surface"
          >
            {expanded ? "Hide Details" : "View Details"}
            {expanded ? <X size={14} /> : <ArrowRight size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setActiveView("ai")}
            className="hidden text-right text-sm font-semibold text-primary hover:underline sm:block"
          >
            A more productive workspace
            <br />
            today.
          </button>
        </div>

        {expanded && digest && (
          <div className="mt-4 max-h-48 space-y-3 overflow-y-auto rounded-xl border border-primary/15 bg-surface/80 p-4">
            {digest.sections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-semibold text-text">{section.title}</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-text-secondary">
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
   NEEDS ATTENTION
========================================================= */

interface AttentionItem {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconClass: string;
  view: View;
  hrmsTab?: string;
}

function NeedsAttention({ items }: { items: AttentionItem[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_3px_18px_rgba(20,50,90,.035)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-error/10 text-error">
            <AlertCircle size={18} />
          </div>
          <h2 className="text-base font-semibold text-text">Needs Your Attention</h2>
          {items.length > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-error px-2 text-[11px] font-semibold text-white">
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setActiveView("inbox")}
          className="text-xs font-medium text-primary hover:underline"
        >
          View All
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-text-secondary">
          <CheckCircle2 size={18} className="text-success" />
          You're all caught up — nothing needs attention.
        </div>
      ) : (
        <div className="divide-y divide-border px-5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.view, item.hrmsTab ? { hrmsTab: item.hrmsTab } : undefined)}
              className="group flex w-full items-center gap-4 py-3 text-left"
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  item.iconClass,
                )}
              >
                <item.icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text">{item.title}</p>
                <p className="mt-0.5 text-[10px] text-text-muted">{item.subtitle}</p>
              </div>
              <ChevronRight
                size={16}
                className="shrink-0 text-text-muted transition group-hover:translate-x-1 group-hover:text-primary"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   DONUT STAT CARD (onboarding / assets / tickets)
========================================================= */

function StatDonutCard({
  title,
  data,
  total,
  centerTitle,
  centerValue,
  onViewAll,
}: {
  title: string;
  data: { label: string; value: number; color: string }[];
  total: number;
  centerTitle: string;
  centerValue?: string | number;
  onViewAll: () => void;
}) {
  return (
    <DashboardCard title={title} onViewAll={onViewAll}>
      <div className="mt-3 flex items-center gap-5">
        <DonutChart
          values={data.map((x) => ({ value: x.value, color: x.color }))}
          total={total}
          centerTitle={centerTitle}
          centerValue={centerValue}
        />
        <div className="flex-1 space-y-3">
          {data.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="min-w-0 flex-1 text-[11px] text-text-secondary">{item.label}</span>
              <span className="text-xs font-medium text-text">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  );
}

/* =========================================================
   RECENT ACTIVITY
========================================================= */

function RecentActivity({ range }: { range: string }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { can } = usePermissions();
  const canViewAudit = can("admin.audit.view");
  const { data: events, isLoading, isError } = useAuditEvents(canViewAudit, 50);

  const filtered = useMemo(
    () => (events ?? []).filter((e) => withinDateRange(e.timestamp ?? e.storedAt, range)).slice(0, 8),
    [events, range],
  );

  const actorIds = useMemo(
    () => [...new Set(filtered.map((e) => e.actorId).filter((id): id is string => Boolean(id)))],
    [filtered],
  );
  const { data: actors } = useUsers(actorIds);
  const actorMap = useMemo(() => new Map((actors ?? []).map((u) => [u.id, getUserDisplayName(u)])), [actors]);

  return (
    <DashboardCard title="Recent Activity" onViewAll={() => setActiveView("inbox")}>
      <div className="mt-1">
        {!canViewAudit ? (
          <p className="py-6 text-sm text-text-muted">You need the admin.audit.view permission to see workspace activity.</p>
        ) : isLoading ? (
          <p className="py-6 text-sm text-text-muted">Loading activity…</p>
        ) : isError ? (
          <p className="py-6 text-sm text-text-muted">Couldn't load the activity feed.</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-sm text-text-muted">No activity in this period.</p>
        ) : (
          filtered.map((event) => {
            const kind = event.eventType.replace(/^teamspace-one\./, "");
            const meta = ACTIVITY_ICONS[kind] ?? { icon: Bell, className: "bg-surface-elevated text-text-muted" };
            const actorName = event.actorId ? (actorMap.get(event.actorId) ?? "Someone") : "System";
            const Icon = meta.icon;
            return (
              <div key={event.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    meta.className,
                  )}
                >
                  <Icon size={14} />
                </div>
                <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-text">
                  {describeAuditEvent(event, actorName)}
                </p>
                <span className="shrink-0 text-[10px] text-text-muted">
                  {formatRelative(event.timestamp ?? event.storedAt)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </DashboardCard>
  );
}

/* =========================================================
   QUICK CHECK IN / OUT
========================================================= */

const PRESENCE_STATUSES = [
  { key: "lunch", label: "Lunch", icon: UtensilsCrossed },
  { key: "tea_break", label: "Tea break", icon: Coffee },
  { key: "out_of_office", label: "Out of office", icon: DoorOpen },
] as const;

function QuickCheckInCard() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: me, isLoading: meLoading, isError: meError } = useMyEmployee();
  const today = new Date().toISOString().slice(0, 10);
  const { data: records, isLoading: attendanceLoading, isError: attendanceError } = useAttendance({
    employeeId: me?.id,
    from: today,
    to: today,
  });
  const checkin = useAttendanceCheckin();
  const checkout = useAttendanceCheckout();
  const presence = useAttendancePresence();
  const record = me?.id ? records?.[0] : undefined;
  const presenceStatus = record?.presenceStatus ?? null;
  const presenceLabel = PRESENCE_STATUSES.find((s) => s.key === presenceStatus)?.label;
  const canSetPresence = Boolean(me?.id && record?.checkInAt && !record?.checkOutAt);

  return (
    <DashboardCard
      title="Quick Check In"
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
          <Clock size={15} />
        </div>
      }
      badge={
        presenceLabel ? (
          <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-semibold text-warning">
            {presenceLabel}
          </span>
        ) : record ? (
          <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-semibold capitalize text-success">
            {record.status}
          </span>
        ) : undefined
      }
      onViewAll={() => setActiveView("my-attendance")}
    >
      <div className="mt-4">
        {meLoading || attendanceLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : meError || attendanceError ? (
          <p className="text-sm text-text-muted">Couldn't load today's attendance.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Checked in</p>
              <p className="mt-1 text-lg font-semibold text-text">
                {record?.checkInAt ? formatTime(record.checkInAt) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Checked out</p>
              <p className="mt-1 text-lg font-semibold text-text">
                {record?.checkOutAt ? formatTime(record.checkOutAt) : "—"}
              </p>
            </div>
          </div>
        )}

        {checkin.error ? <p className="mt-2 text-xs text-error">{checkin.error.message}</p> : null}
        {checkout.error ? <p className="mt-2 text-xs text-error">{checkout.error.message}</p> : null}
        {presence.error ? <p className="mt-2 text-xs text-error">{presence.error.message}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <PermissionGate permission="hrms.attendance.checkin">
            {me?.id && !record?.checkInAt ? (
              <button
                type="button"
                disabled={checkin.isPending}
                onClick={() => checkin.mutate()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                <LogIn size={13} />
                {checkin.isPending ? "Checking in…" : "Check in"}
              </button>
            ) : null}
          </PermissionGate>
          <PermissionGate permission="hrms.attendance.checkout">
            {me?.id && record?.checkInAt && !record?.checkOutAt ? (
              <button
                type="button"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate()}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-[11px] font-semibold text-text transition hover:bg-surface-elevated disabled:opacity-50"
              >
                <LogOut size={13} />
                {checkout.isPending ? "Checking out…" : "Check out"}
              </button>
            ) : null}
          </PermissionGate>
          {me?.id && record?.checkOutAt ? (
            <span className="flex items-center gap-2 text-[11px] text-text-muted">
              <CheckCircle2 size={13} className="text-success" />
              Done for today
            </span>
          ) : null}
        </div>

        {canSetPresence ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {PRESENCE_STATUSES.map(({ key, label, icon: Icon }) => {
              const active = presenceStatus === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={presence.isPending}
                  onClick={() => presence.mutate(active ? null : key)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[10px] font-medium transition disabled:opacity-50",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-surface text-text-secondary hover:bg-surface-elevated",
                  )}
                >
                  <Icon size={12} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardCard>
  );
}

/* =========================================================
   PERSONAL TODOS CARD
========================================================= */

function PersonalTodosCard() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const todos = useTodos();
  const create = useCreateTodo();
  const update = useUpdateTodo();
  const remove = useDeleteTodo();
  const [title, setTitle] = useState("");

  const openTodos = useMemo(
    () =>
      (todos.data ?? [])
        .filter((t) => !t.completedAt)
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
        .slice(0, 5),
    [todos.data],
  );

  function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate({ title: trimmed }, { onSuccess: () => setTitle("") });
  }

  return (
    <DashboardCard
      title="My Todos"
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ListTodo size={16} />
        </div>
      }
      onViewAll={() => setActiveView("hr-dashboard")}
    >
      <form onSubmit={addTodo} className="mt-3 flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a quick task…"
          className="h-9 flex-1 text-[12px]"
        />
        <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
          <Plus size={14} />
        </Button>
      </form>

      <div className="mt-3 space-y-1">
        {todos.isLoading ? (
          <SectionSkeleton rows={3} />
        ) : todos.isError ? (
          <SectionError onRetry={() => todos.refetch()} />
        ) : openTodos.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">No open tasks. Great job!</p>
        ) : (
          openTodos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-2 rounded-lg border border-border px-2 py-2 transition hover:bg-surface-elevated/40"
            >
              <button
                type="button"
                aria-label="Mark complete"
                disabled={update.isPending}
                onClick={() => update.mutate({ todoId: todo.id, body: { completed: true } })}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-primary hover:border-primary/50"
              >
                <CheckSquare size={12} />
              </button>
              <span className="min-w-0 flex-1 truncate text-[12px] text-text">{todo.title}</span>
              {todo.dueDate ? (
                <span className="shrink-0 text-[10px] text-text-muted">{formatDate(todo.dueDate)}</span>
              ) : null}
              <button
                type="button"
                aria-label="Delete todo"
                disabled={remove.isPending}
                onClick={() => remove.mutate(todo.id)}
                className="shrink-0 text-text-muted transition hover:text-error"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}

/* =========================================================
   TIME TRACKING CARD
========================================================= */

function TimeTrackingCard() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const entries = useTimeEntries({ from: today, to: today });

  const list = entries.data ?? [];
  const totalMinutes = list.reduce((s, e) => s + e.minutes, 0);
  const billableMinutes = list.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0);

  function fmt(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
  }

  function entryLabel(e: TimeEntry) {
    return e.task?.title ?? e.label ?? "General";
  }

  return (
    <DashboardCard
      title="Time Tracking"
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
          <Clock3 size={16} />
        </div>
      }
      onViewAll={() => setActiveView("my-timesheet")}
    >
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-surface-elevated/50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Today</p>
          <p className="mt-1 text-lg font-semibold text-text">{fmt(totalMinutes)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-elevated/50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Billable</p>
          <p className="mt-1 text-lg font-semibold text-text">{fmt(billableMinutes)}</p>
        </div>
      </div>

      <div className="mt-3">
        {entries.isLoading ? (
          <SectionSkeleton rows={3} />
        ) : entries.isError ? (
          <SectionError onRetry={() => entries.refetch()} />
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">No time logged today.</p>
        ) : (
          <div className="space-y-1.5">
            {list.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-[12px]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1 truncate text-text">{entryLabel(e)}</span>
                <span className="shrink-0 text-text-secondary">{fmt(e.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="mt-4 w-full"
        onClick={() => setActiveView("my-timesheet")}
      >
        Open Timesheet
      </Button>
    </DashboardCard>
  );
}

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export function AdminHomeScreen() {
  const { data: user } = useMe();
  const organisationId = getActiveOrganisation() ?? undefined;
  const [range, setRange] = useState("7d");

  const { data: members } = useMembers(organisationId);
  const { data: channels } = useChannels();
  const { data: tickets } = useTickets(organisationId);
  const { data: assets } = useAssets(organisationId);
  const { data: meetings } = useMeetings();
  const { data: onboardingInstances } = useOnboardingInstances();
  const { data: offboardingCases } = useOffboardingCases();
  const { data: notifications } = useNotifications();

  const memberList = members ?? [];
  const channelList = channels ?? [];
  const ticketList = tickets ?? [];
  const assetList = assets ?? [];
  const meetingList = meetings ?? [];
  const onboardingList = onboardingInstances ?? [];
  const offboardingList = offboardingCases ?? [];

  const newMembers = useMemo(
    () => memberList.filter((m) => withinDateRange(m.createdAt, range)),
    [memberList, range],
  );

  const openTickets = useMemo(
    () => ticketList.filter((t) => t.status !== "solved"),
    [ticketList],
  );

  const overdueCriticalTickets = useMemo(
    () =>
      ticketList.filter(
        (t) =>
          (t.priority === "urgent" || t.priority === "high") &&
          t.status !== "solved" &&
          Date.now() - new Date(t.createdAt).getTime() > 24 * 3600000,
      ),
    [ticketList],
  );

  const assignedUserIds = useMemo(
    () => new Set(assetList.map((a) => a.currentAssignment?.assigneeUserId).filter(Boolean)),
    [assetList],
  );

  const membersAwaitingAssets = useMemo(
    () => newMembers.filter((m) => !assignedUserIds.has(m.userId)),
    [newMembers, assignedUserIds],
  );

  const pendingOnboarding = useMemo(
    () => onboardingList.filter((i) => i.status === "pending"),
    [onboardingList],
  );

  const maintenanceAssets = useMemo(
    () => assetList.filter((a) => a.status === "maintenance"),
    [assetList],
  );

  const unreadCount = useMemo(
    () => (notifications ?? []).filter((n) => !n.read).length,
    [notifications],
  );

  const todaysMeetings = useMemo(() => {
    const today = new Date().toDateString();
    return meetingList.filter(
      (m) => m.status !== "ended" && m.scheduledAt && new Date(m.scheduledAt).toDateString() === today,
    );
  }, [meetingList]);

  const attentionItems: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    if (overdueCriticalTickets.length > 0) {
      items.push({
        id: "overdue-tickets",
        title: `${plural(overdueCriticalTickets.length, "critical ticket")} overdue`,
        subtitle: "Response due > 24 hrs",
        icon: AlertCircle,
        iconClass: "bg-error/10 text-error",
        view: "tickets",
      });
    }
    if (membersAwaitingAssets.length > 0) {
      items.push({
        id: "awaiting-assets",
        title: `${plural(membersAwaitingAssets.length, "user")} awaiting asset assignment`,
        subtitle: "Joined recently",
        icon: Users,
        iconClass: "bg-info/10 text-info",
        view: "assets",
      });
    }
    if (pendingOnboarding.length > 0) {
      items.push({
        id: "pending-onboarding",
        title: `${plural(pendingOnboarding.length, "onboarding")} not started`,
        subtitle: "Awaiting provisioning",
        icon: UserCheck,
        iconClass: "bg-warning/10 text-warning",
        view: "hrms",
        hrmsTab: "onboarding",
      });
    }
    if (maintenanceAssets.length > 0) {
      items.push({
        id: "maintenance-assets",
        title: `${plural(maintenanceAssets.length, "asset")} under maintenance`,
        subtitle: "Currently unavailable",
        icon: Package,
        iconClass: "bg-warning/10 text-warning",
        view: "assets",
      });
    }
    if (unreadCount > 0) {
      items.push({
        id: "unread",
        title: `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`,
        subtitle: "In your inbox",
        icon: Bell,
        iconClass: "bg-primary/10 text-primary",
        view: "inbox",
      });
    }
    return items;
  }, [overdueCriticalTickets, membersAwaitingAssets, pendingOnboarding, maintenanceAssets, unreadCount]);

  const onboardingData = [
    { label: "Completed", value: onboardingList.filter((i) => i.status === "completed").length, color: "var(--success)" },
    { label: "In progress", value: onboardingList.filter((i) => i.status === "in_progress").length, color: "var(--info)" },
    { label: "Pending", value: pendingOnboarding.length, color: "var(--warning)" },
    { label: "Cancelled", value: onboardingList.filter((i) => i.status === "cancelled").length, color: "var(--text-muted)" },
  ];

  const assetData = [
    { label: "In Use", value: assetList.filter((a) => a.status === "assigned").length, color: "var(--info)" },
    { label: "Available", value: assetList.filter((a) => a.status === "available").length, color: "var(--success)" },
    { label: "Under Maintenance", value: maintenanceAssets.length, color: "var(--warning)" },
    { label: "Retired", value: assetList.filter((a) => a.status === "retired").length, color: "var(--error)" },
  ];

  const activeOffboardings = offboardingList.filter(
    (c) => c.status !== "completed" && c.status !== "cancelled",
  );

  const offboardingData = [
    { label: "In progress", value: activeOffboardings.length, color: "var(--info)" },
    { label: "Completed", value: offboardingList.filter((c) => c.status === "completed").length, color: "var(--success)" },
    { label: "Cancelled", value: offboardingList.filter((c) => c.status === "cancelled").length, color: "var(--text-muted)" },
  ];

  const ticketData = [
    { label: "New", value: ticketList.filter((t) => t.status === "new").length, color: "var(--error)" },
    { label: "Open", value: ticketList.filter((t) => t.status === "open").length, color: "var(--warning)" },
    { label: "Pending", value: ticketList.filter((t) => t.status === "pending").length, color: "var(--info)" },
    { label: "Solved", value: ticketList.filter((t) => t.status === "solved").length, color: "var(--success)" },
  ];

  const displayName = getUserDisplayName(user, "there");
  const todayLabel = new Date().toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="h-full overflow-y-auto bg-background text-text">
      <div className="mx-auto max-w-[1550px] px-5 py-6 lg:px-7">
        {/* HEADER */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-text">
              {getGreeting()}, {displayName}!
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Here's what's important across your workspace.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-text-secondary sm:block">{todayLabel}</span>
            <FilterDropdown value={range} onChange={setRange} options={DATE_RANGE_OPTIONS} />
          </div>
        </header>

        {/* HERO */}
        <section className="mt-5 grid gap-4 xl:grid-cols-[1.45fr_.95fr]">
          <AiDailyBrief />
          <NeedsAttention items={attentionItems} />
        </section>

        {/* KPI CARDS */}
        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            icon={<Users size={22} />}
            iconClass="bg-info/10 text-info"
            title="Total Users"
            value={memberList.length}
            delta={deltaPercent(memberList.map((m) => m.createdAt), 30)}
            footer="vs last month"
            onClick={() => useUIStore.getState().setActiveView("members")}
          />
          <KpiCard
            icon={<Hash size={22} />}
            iconClass="bg-primary/10 text-primary"
            title="Active Channels"
            value={channelList.length}
            delta={deltaPercent(channelList.map((c) => c.createdAt), 30)}
            footer="vs last month"
            onClick={() => {
              const first = channelList.find((c) => c.type !== "direct") ?? channelList[0];
              if (first) useUIStore.getState().setActiveView("channel", { channelId: first.id });
            }}
          />
          <KpiCard
            icon={<Ticket size={22} />}
            iconClass="bg-warning/10 text-warning"
            title="Open Tickets"
            value={openTickets.length}
            delta={deltaPercent(ticketList.map((t) => t.createdAt), 7)}
            footer="vs last week"
            onClick={() => useUIStore.getState().setActiveView("tickets")}
          />
          <KpiCard
            icon={<Package size={22} />}
            iconClass="bg-success/10 text-success"
            title="Total Assets"
            value={assetList.length}
            delta={deltaPercent(assetList.map((a) => a.createdAt), 30)}
            footer="vs last month"
            onClick={() => useUIStore.getState().setActiveView("assets")}
          />
          <KpiCard
            icon={<CalendarDays size={22} />}
            iconClass="bg-primary/10 text-primary"
            title="Upcoming Meetings"
            value={todaysMeetings.length}
            footer="Today"
            onClick={() => useUIStore.getState().setActiveView("meeting")}
          />
        </section>

        {/* ANALYTICS */}
        <section className="mt-4 grid gap-4 xl:grid-cols-3">
          <QuickCheckInCard />
          <StatDonutCard
            title="Assets Overview"
            data={assetData}
            total={Math.max(1, assetList.length)}
            centerTitle="Total Assets"
            onViewAll={() => useUIStore.getState().setActiveView("assets")}
          />
          <StatDonutCard
            title="Ticket Status"
            data={ticketData}
            total={Math.max(1, ticketList.length)}
            centerTitle="Total Tickets"
            onViewAll={() => useUIStore.getState().setActiveView("tickets")}
          />
        </section>

        {/* PERSONAL PRODUCTIVITY */}
        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <PersonalTodosCard />
          <TimeTrackingCard />
        </section>

        {/* BOTTOM */}
        <section className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr_.85fr]">
          <RecentActivity range={range} />
          <StatDonutCard
            title="User Offboarding"
            data={offboardingData}
            total={Math.max(1, offboardingList.length)}
            centerValue={activeOffboardings.length}
            centerTitle="Active Cases"
            onViewAll={() => useUIStore.getState().setActiveView("hrms", { hrmsTab: "offboarding" })}
          />
          <StatDonutCard
            title="User Onboarding"
            data={onboardingData}
            total={Math.max(1, onboardingData.reduce((s, d) => s + d.value, 0))}
            centerValue={newMembers.length}
            centerTitle="New Users"
            onViewAll={() => useUIStore.getState().setActiveView("hrms", { hrmsTab: "onboarding" })}
          />
        </section>

        {/* FOOTER */}
        <footer className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] text-text-muted">Teamspace One Administration</p>
          <div className="flex items-center gap-2 text-[10px] text-text-muted">
            <CheckCircle2 size={13} className="text-success" />
            Workspace systems operational
          </div>
        </footer>
      </div>
    </div>
  );
}
