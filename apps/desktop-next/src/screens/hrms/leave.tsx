import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Ellipsis,
  FileText,
  Home,
  Info,
  Leaf,
  Plane,
  Plus,
  Stethoscope,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useApplyLeave,
  useHolidays,
  useHrmsCalendar,
  useLeaveBalances,
  useLeaveRequests,
  useLeaveTypes,
  useMyEmployee,
  useReviewLeaveRequest,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import type { LeaveRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@teamspace-one/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import {
  SectionError,
  SectionSkeleton,
  StatusBadge,
  formatDate,
} from "./common";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtDay(iso?: string | null) {
  const d = toDate(iso);
  return d
    ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function requestDays(r: LeaveRequest) {
  if (r.days != null) return r.days;
  return daysBetween(r.startDate, r.endDate) || 1;
}

/** Inclusive day count between two ISO dates; 0 when invalid/reversed. */
function daysBetween(start?: string | null, end?: string | null) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e || e < s) return 0;
  return Math.round((e.getTime() - s.getTime()) / DAY_MS) + 1;
}

/** Statuses that mean "still awaiting a final decision". */
const PENDING_STATUSES = new Set(["pending", "manager_approved"]);

/** Every calendar day covered by a request (capped to avoid runaway ranges). */
function eachDay(r: LeaveRequest): Date[] {
  const s = toDate(r.startDate);
  const e = toDate(r.endDate) ?? s;
  if (!s || !e) return [];
  const out: Date[] = [];
  for (let t = s.getTime(), i = 0; t <= e.getTime() && i < 62; t += DAY_MS, i++) {
    out.push(new Date(t));
  }
  return out;
}

const TYPE_FALLBACKS = [
  { Icon: CalendarDays, cls: "bg-primary/10 text-primary" },
  { Icon: Sun, cls: "bg-warning/10 text-warning" },
  { Icon: Plane, cls: "bg-info/10 text-info" },
  { Icon: Clock3, cls: "bg-mention/10 text-mention" },
];

function leaveTypeVisual(name?: string | null, seed = "") {
  const n = (name ?? "").toLowerCase();
  if (/sick|medical|health/.test(n)) return { Icon: Stethoscope, cls: "bg-error/10 text-error" };
  if (/vacation|annual|travel|trip|holiday/.test(n)) return { Icon: Plane, cls: "bg-info/10 text-info" };
  if (/home|remote|wfh/.test(n)) return { Icon: Home, cls: "bg-success/10 text-success" };
  if (/casual/.test(n)) return { Icon: Sun, cls: "bg-warning/10 text-warning" };
  if (/personal|errand/.test(n)) return { Icon: Clock3, cls: "bg-warning/10 text-warning" };
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return TYPE_FALLBACKS[h % TYPE_FALLBACKS.length];
}

// ---------------------------------------------------------------------------
// Apply-leave dialog
// ---------------------------------------------------------------------------

export function ApplyLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const types = useLeaveTypes();
  const balances = useLeaveBalances();
  const apply = useApplyLeave();
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const selectedBalance = (balances.data ?? []).find((b) => b.leaveTypeId === leaveTypeId);
  const days = daysBetween(startDate, endDate);

  function submit() {
    if (!leaveTypeId || !startDate || !endDate || days < 1) return;
    apply.mutate(
      { leaveTypeId, startDate, endDate, days, reason: reason || undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>Your request will go to your approver for review.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Leave type *</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
            >
              <option value="">Select…</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">From *</span>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">To *</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Reason</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {startDate && endDate ? (
            <p className={cn("text-xs", days < 1 ? "text-error" : "text-text-muted")}>
              {days < 1 ? "End date must be on or after the start date." : `${days} day${days === 1 ? "" : "s"} requested.`}
            </p>
          ) : null}
          {selectedBalance ? (
            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary-subtle px-3 py-2">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-text-secondary">
                You have <span className="font-semibold text-text">{selectedBalance.remaining} day{selectedBalance.remaining === 1 ? "" : "s"}</span> of{" "}
                {selectedBalance.leaveTypeName ?? "this leave"} remaining.
              </p>
            </div>
          ) : null}
          {apply.isError ? (
            <p className="text-xs text-error">{apply.error?.message ?? "Could not submit the request."}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={apply.isPending || !leaveTypeId || days < 1}>
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Summary card with progress ring
// ---------------------------------------------------------------------------

function RingStat({
  icon,
  iconCls,
  title,
  value,
  unit,
  subtitle,
  pct,
  ringColor,
}: {
  icon: React.ReactNode;
  iconCls: string;
  title: string;
  value: string;
  unit: string;
  subtitle: string;
  pct: number;
  ringColor: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const circumference = 2 * Math.PI * 34;
  return (
    <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconCls)}>
            {icon}
          </div>
          <span className="truncate text-sm font-medium text-text-secondary">{title}</span>
        </div>
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold leading-none text-text">{value}</span>
          <span className="text-sm text-text-muted">{unit}</span>
        </div>
        <p className="mt-1.5 truncate text-xs text-text-muted">{subtitle}</p>
      </div>
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 82 82" className="h-full w-full -rotate-90">
          <circle cx="41" cy="41" r="34" fill="none" stroke="var(--surface-elevated)" strokeWidth="7" />
          <circle
            cx="41"
            cy="41"
            r="34"
            fill="none"
            stroke={ringColor}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (clamped / 100) * circumference}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-text">
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leave list item
// ---------------------------------------------------------------------------

function LeaveItem({
  request,
  compact = false,
  canCancel = false,
  onCancel,
  cancelling = false,
}: {
  request: LeaveRequest;
  compact?: boolean;
  canCancel?: boolean;
  onCancel?: (id: string) => void;
  cancelling?: boolean;
}) {
  const { Icon, cls } = leaveTypeVisual(request.leaveTypeName, request.leaveTypeId);
  const days = requestDays(request);
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        compact
          ? "border-b border-border py-3 last:border-0"
          : "rounded-xl border border-border bg-surface-elevated/40 p-4",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg",
          cls,
          compact ? "h-10 w-10" : "h-11 w-11",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{request.leaveTypeName ?? "Leave"}</p>
        <p className="mt-0.5 text-xs text-text-muted">
          {fmtDay(request.startDate)}
          {request.endDate && request.endDate !== request.startDate ? ` – ${fmtDay(request.endDate)}` : ""}
          {" · "}
          {days} {days === 1 ? "day" : "days"}
        </p>
        {!compact && request.reason ? (
          <p className="mt-1 truncate text-xs text-text-muted">{request.reason}</p>
        ) : null}
      </div>
      <StatusBadge status={request.status} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Leave actions"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!canCancel || request.status !== "pending" || cancelling}
            onClick={() => onCancel?.(request.id)}
            className="text-xs"
          >
            Cancel request
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function LeaveCalendar({
  requests,
  eventDays,
}: {
  requests: LeaveRequest[];
  eventDays: Set<string>;
}) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => dayKey(new Date()));

  const approvedDays = useMemo(() => {
    const s = new Set<string>();
    for (const r of requests) {
      if (r.status === "approved") eachDay(r).forEach((d) => s.add(dayKey(d)));
    }
    return s;
  }, [requests]);

  const pendingDays = useMemo(() => {
    const s = new Set<string>();
    for (const r of requests) {
      if (PENDING_STATUSES.has(r.status)) eachDay(r).forEach((d) => s.add(dayKey(d)));
    }
    return s;
  }, [requests]);

  const cells = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const todayKey = dayKey(new Date());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated text-text-muted">
            <CalendarDays className="h-[18px] w-[18px]" />
          </div>
          <h2 className="text-lg font-semibold text-text">{monthLabel}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated text-text-muted transition-colors hover:text-text"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated text-text-muted transition-colors hover:text-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
              setSelected(dayKey(n));
            }}
            className="ml-1 h-9 rounded-lg bg-surface-elevated px-3.5 text-xs font-medium text-text-secondary transition-colors hover:text-text"
          >
            Today
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-text-muted">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-1">
        {cells.map((d) => {
          const key = dayKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          const isApproved = inMonth && approvedDays.has(key);
          const isPending = inMonth && !isApproved && pendingDays.has(key);
          const hasEvent = inMonth && eventDays.has(key);
          const isSelected = inMonth && key === selected;
          return (
            <button
              key={key}
              type="button"
              onClick={() => inMonth && setSelected(key)}
              className="relative flex h-11 items-center justify-center"
            >
              <span
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors",
                  isToday
                    ? "bg-primary font-medium text-white"
                    : isApproved
                      ? "bg-success/15 text-success"
                      : isPending
                        ? "bg-warning/15 text-warning"
                        : isSelected
                          ? "bg-surface-elevated text-text"
                          : !inMonth
                            ? "text-text-muted/40"
                            : "text-text-secondary hover:bg-surface-elevated",
                )}
              >
                {d.getDate()}
                {hasEvent && !isApproved && !isPending && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-info" />
                )}
                {(isApproved || isPending) && (
                  <span
                    className={cn(
                      "absolute bottom-0.5 h-1 w-1 rounded-full",
                      isApproved ? "bg-success" : "bg-warning",
                    )}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4">
        {[
          { cls: "bg-success", label: "Approved leave" },
          { cls: "bg-warning", label: "Pending leave" },
          { cls: "bg-primary", label: "Today" },
          { cls: "bg-info", label: "Other events" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", l.cls)} />
            <span className="text-[11px] text-text-muted">{l.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

type LeaveTab = "calendar" | "requests" | "policy" | "approvals";

export function LeaveSection() {
  const { can } = usePermissions();
  const me = useMyEmployee();
  const canApprove = can("hrms.leave.approve");
  const canReject = can("hrms.leave.reject");
  const canReview = canApprove || canReject;
  const canApply = can("hrms.leave.apply");
  const balances = useLeaveBalances(me.data?.id);
  const myRequests = useLeaveRequests({ mine: true });
  const approvalRequests = useLeaveRequests(canReview ? undefined : { mine: true });
  const review = useReviewLeaveRequest();
  const holidays = useHolidays();
  const leaveTypes = useLeaveTypes();

  const [tab, setTab] = useState<LeaveTab>("calendar");
  const [applyOpen, setApplyOpen] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const today = new Date();
  const rangeEnd = new Date(today);
  rangeEnd.setMonth(rangeEnd.getMonth() + 3);
  const calendar = useHrmsCalendar({
    from: today.toISOString().slice(0, 10),
    to: rangeEnd.toISOString().slice(0, 10),
  });

  const requests = useMemo(
    () =>
      [...(myRequests.data ?? [])].sort((a, b) =>
        (a.startDate ?? "").localeCompare(b.startDate ?? ""),
      ),
    [myRequests.data],
  );

  const stats = useMemo(() => {
    const bs = balances.data ?? [];
    const entitled = bs.reduce((a, b) => a + (b.entitled ?? 0), 0);
    const used = bs.reduce((a, b) => a + (b.used ?? 0), 0);
    const remaining = bs.reduce((a, b) => a + (b.remaining ?? 0), 0);
    const pending = requests.filter((r) => PENDING_STATUSES.has(r.status)).length;
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const upcoming = requests.filter(
      (r) => r.status === "approved" && (toDate(r.endDate)?.getTime() ?? 0) >= todayStart,
    );
    const upcomingDays = upcoming.reduce((a, r) => a + requestDays(r), 0);
    return { entitled, used, remaining, pending, upcoming, upcomingDays, total: requests.length };
  }, [balances.data, requests, today]);

  const upcoming = stats.upcoming;
  const history = useMemo(
    () =>
      requests
        .filter((r) => !upcoming.includes(r))
        .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "")),
    [requests, upcoming],
  );

  const eventDays = useMemo(() => {
    const s = new Set<string>();
    for (const h of holidays.data ?? []) {
      const d = toDate(h.date);
      if (d) s.add(dayKey(d));
    }
    for (const e of [...(calendar.data?.holidays ?? []), ...(calendar.data?.events ?? [])]) {
      const start = toDate(e.startAt);
      const end = toDate(e.endAt) ?? start;
      if (!start || !end) continue;
      for (let t = start.getTime(), i = 0; t <= end.getTime() && i < 62; t += DAY_MS, i++) {
        s.add(dayKey(new Date(t)));
      }
    }
    return s;
  }, [holidays.data, calendar.data]);

  if (me.isLoading || balances.isLoading || myRequests.isLoading) return <SectionSkeleton />;
  if (me.isError) return <SectionError onRetry={() => me.refetch()} message={me.error?.message} />;
  if (!me.data) return <EmptyState icon={CalendarClock} title="No employee record" description="Leave management is only available for employees." />;
  if (balances.isError) return <SectionError onRetry={() => balances.refetch()} />;

  const nextUpcoming = upcoming[0];
  const tabs: { id: LeaveTab; label: string; icon: LucideIcon }[] = [
    { id: "calendar", label: "Calendar View", icon: CalendarDays },
    { id: "requests", label: "My Requests", icon: FileText },
    { id: "policy", label: "Leave Policy", icon: Info },
    ...(canReview ? [{ id: "approvals" as LeaveTab, label: "Approvals", icon: Check }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-text-secondary">
            <CalendarDays className="h-8 w-8" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-text">My Leaves</h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Manage your time off and plan your time better
            </p>
          </div>
        </div>
        {canApply ? (
          <Button onClick={() => setApplyOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Apply Leave
          </Button>
        ) : null}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RingStat
          icon={<Leaf className="h-5 w-5" />}
          iconCls="bg-success/10 text-success"
          title="Available Leaves"
          value={String(stats.remaining)}
          unit="days"
          subtitle={`out of ${stats.entitled} days`}
          pct={stats.entitled > 0 ? (stats.remaining / stats.entitled) * 100 : 0}
          ringColor="var(--success)"
        />
        <RingStat
          icon={<CalendarDays className="h-5 w-5" />}
          iconCls="bg-info/10 text-info"
          title="Used Leaves"
          value={String(stats.used)}
          unit="days"
          subtitle="this year"
          pct={stats.entitled > 0 ? (stats.used / stats.entitled) * 100 : 0}
          ringColor="var(--info)"
        />
        <RingStat
          icon={<Clock3 className="h-5 w-5" />}
          iconCls="bg-warning/10 text-warning"
          title="Pending Requests"
          value={String(stats.pending)}
          unit={stats.pending === 1 ? "request" : "requests"}
          subtitle="awaiting approval"
          pct={stats.total > 0 ? (stats.pending / stats.total) * 100 : 0}
          ringColor="var(--warning)"
        />
        <RingStat
          icon={<Plane className="h-5 w-5" />}
          iconCls="bg-primary/10 text-primary"
          title="Upcoming Leaves"
          value={String(stats.upcomingDays)}
          unit="days"
          subtitle={nextUpcoming ? `next leave on ${fmtDay(nextUpcoming.startDate)}` : "nothing scheduled"}
          pct={stats.entitled > 0 ? (stats.upcomingDays / stats.entitled) * 100 : 0}
          ringColor="var(--primary)"
        />
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                tab === t.id
                  ? "border-primary font-medium text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Calendar view */}
      {tab === "calendar" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
          <div className="flex flex-col gap-5">
            <LeaveCalendar requests={requests} eventDays={eventDays} />

            {/* Need a break banner */}
            {canApply ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary-subtle px-6 py-5">
                <div className="flex items-center gap-4">
                  <div className="hidden h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary sm:flex">
                    <Leaf className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-text">Need a break?</h3>
                    <p className="mt-0.5 text-sm text-text-muted">
                      A well-rested you is a more productive you.
                    </p>
                  </div>
                </div>
                <Button onClick={() => setApplyOpen(true)}>Apply Leave</Button>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-5">
            {/* Upcoming */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-text">Upcoming Leaves</h3>
                {upcoming.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllUpcoming((v) => !v)}
                    className="text-xs font-medium text-info hover:underline"
                  >
                    {showAllUpcoming ? "Show Less" : "View All"}
                  </button>
                ) : null}
              </div>
              {upcoming.length === 0 ? (
                <p className="text-xs text-text-muted">No upcoming approved leave.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {(showAllUpcoming ? upcoming : upcoming.slice(0, 2)).map((r) => (
                    <LeaveItem
                      key={r.id}
                      request={r}
                      canCancel={canApply}
                      cancelling={review.isPending}
                      onCancel={(id) => review.mutate({ id, action: "cancel" })}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Recent history */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold text-text">Recent Leave History</h3>
                {history.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllHistory((v) => !v)}
                    className="text-xs font-medium text-info hover:underline"
                  >
                    {showAllHistory ? "Show Less" : "View All"}
                  </button>
                ) : null}
              </div>
              {history.length === 0 ? (
                <p className="py-2 text-xs text-text-muted">No past leave requests.</p>
              ) : (
                <div>
                  {(showAllHistory ? history : history.slice(0, 3)).map((r) => (
                    <LeaveItem
                      key={r.id}
                      request={r}
                      compact
                      canCancel={canApply}
                      cancelling={review.isPending}
                      onCancel={(id) => review.mutate({ id, action: "cancel" })}
                    />
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}

      {/* My requests */}
      {tab === "requests" && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-text">My Leave Requests</h3>
              <p className="mt-0.5 text-xs text-text-muted">Track all your leave applications</p>
            </div>
            {canApply ? (
              <Button size="sm" onClick={() => setApplyOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Apply Leave
              </Button>
            ) : null}
          </div>
          {requests.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No leave requests yet"
              description="Requests you submit will show up here."
            />
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {[...requests]
                .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
                .map((r) => (
                  <LeaveItem
                    key={r.id}
                    request={r}
                    canCancel={canApply}
                    cancelling={review.isPending}
                    onCancel={(id) => review.mutate({ id, action: "cancel" })}
                  />
                ))}
            </div>
          )}
        </section>
      )}

      {/* Leave policy */}
      {tab === "policy" && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(leaveTypes.data ?? []).map((t) => {
            const { Icon, cls } = leaveTypeVisual(t.name, t.id);
            return (
              <div key={t.id} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", cls)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                    {t.annualQuota != null ? `${t.annualQuota} days / year` : "As per policy"}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-text">{t.name}</h3>
                <p className="mt-1.5 text-xs leading-5 text-text-muted">
                  {t.code ? `${t.code} · ` : ""}
                  {t.isPaid === false ? "Unpaid leave" : "Paid leave"}
                </p>
              </div>
            );
          })}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
                <CalendarDays className="h-[18px] w-[18px]" />
              </div>
              <span className="rounded-full bg-info/10 px-3 py-1 text-[11px] font-medium text-info">
                {(holidays.data ?? []).length} holidays
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-text">Public Holidays</h3>
            <p className="mt-1.5 text-xs leading-5 text-text-muted">
              {(holidays.data ?? []).length === 0
                ? "No holidays configured yet."
                : (holidays.data ?? [])
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .filter((h) => (toDate(h.date)?.getTime() ?? 0) >= today.getTime() - DAY_MS)
                    .slice(0, 3)
                    .map((h) => `${h.name} (${formatDate(h.date)})`)
                    .join(" · ") || "Company holidays are excluded from your leave balance."}
            </p>
          </div>
          {(leaveTypes.data ?? []).length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-5 sm:col-span-2 xl:col-span-3">
              <EmptyState
                icon={FileText}
                title="No leave policy configured"
                description="Leave types will appear here once HR sets them up."
              />
            </div>
          )}
        </section>
      )}

      {/* Approvals */}
      {tab === "approvals" && canReview ? (
        <Card>
          <CardHeader><CardTitle>Approval queue</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(approvalRequests.data ?? []).filter((r) => PENDING_STATUSES.has(r.status)).length === 0 ? (
              <p className="p-4 text-xs text-text-muted">Nothing awaiting approval.</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-text-muted">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Dates</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {(approvalRequests.data ?? [])
                    .filter((r) => PENDING_STATUSES.has(r.status))
                    .map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-text">{r.employeeName ?? r.employeeId}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{r.leaveTypeName ?? "Leave"}</td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {formatDate(r.startDate)} – {formatDate(r.endDate)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{r.reason ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Approve"
                            disabled={review.isPending || !canApprove}
                            onClick={() => review.mutate({ id: r.id, action: "approve" })}
                          >
                            <Check className="h-4 w-4 text-success" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Reject"
                            disabled={review.isPending || !canReject}
                            onClick={() => {
                              const note = window.prompt("Rejection note (optional)") ?? undefined;
                              review.mutate({ id: r.id, action: "reject", note });
                            }}
                          >
                            <X className="h-4 w-4 text-error" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
