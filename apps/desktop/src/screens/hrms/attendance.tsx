import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  FileText,
  Fingerprint,
  LogIn,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  useAttendance,
  useAttendanceCheckin,
  useAttendanceCheckout,
  useAttendancePresence,
  useMe,
  useMyEmployee,
  useRequestAttendanceCorrection,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import type { AttendanceRecord } from "../../lib/api";
import {
  SectionError,
  SectionSkeleton,
  StatusBadge,
  formatDate,
  formatTime,
} from "./common";
import { FilterDropdown } from "../hr/common";
import { cn, getUserDisplayName } from "../../lib/utils";

function dateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayStr() {
  return dateKey(new Date());
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

/** Standard full working day: 9h. */
const DAY_TARGET_MIN = 9 * 60;
const WEEK_TARGET_MIN = 40 * 60;
const MONTH_TARGET_MIN = 160 * 60;
/** Timeline axis: 06:00 → 20:00 local time. */
const AXIS_START_H = 6;
const AXIS_END_H = 20;

function hoursLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}.${String(m).padStart(2, "0")}`;
}

function hoursMinutesLabel(mins: number | null) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function minutesOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function timerLabel(totalSecs: number) {
  const s = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function RequestCorrectionDialog({
  record,
  open,
  onOpenChange,
}: {
  record: AttendanceRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const request = useRequestAttendanceCorrection();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");

  if (!record) return null;

  const date = record.date.slice(0, 10);
  const attendanceId = record.id;

  function submit() {
    if (!reason.trim()) return;
    request.mutate(
      {
        attendanceId,
        reason: reason.trim(),
        requestedCheckInAt: checkIn ? `${date}T${checkIn}:00` : undefined,
        requestedCheckOutAt: checkOut ? `${date}T${checkOut}:00` : undefined,
      },
      {
        onSuccess: () => {
          setCheckIn("");
          setCheckOut("");
          setReason("");
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request attendance correction</DialogTitle>
          <DialogDescription>Submit updated check-in/out times for {formatDate(record.date)}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Requested check-in</span>
              <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Requested check-out</span>
              <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Reason *</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this correction needed?" />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!reason.trim() || request.isPending}>Submit</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HoursCard({
  icon: Icon,
  iconClass,
  value,
  target,
  label,
  delta,
  deltaLabel,
}: {
  icon: React.ElementType;
  iconClass: string;
  value: number;
  target: number;
  label: string;
  delta: number | null;
  deltaLabel: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className={cn("flex h-7 w-7 items-center justify-center rounded", iconClass)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="mt-3 text-xl font-bold text-text">
        {hoursLabel(value)} <span className="text-xs font-normal text-text-muted">/ {Math.round(target / 60)}</span>
      </div>
      <div className="text-xs text-text-secondary">{label}</div>
      {delta != null && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs">
          {up ? (
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-error" />
          )}
          <span className={up ? "text-success" : "text-error"}>{Math.abs(Math.round(delta))}%</span>
          <span className="text-text-muted">by {deltaLabel}</span>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

export function AttendanceSection() {
  const { can } = usePermissions();
  const me = useMyEmployee();
  const { data: user } = useMe();
  const [from, setFrom] = useState(daysAgo(60));
  const [to, setTo] = useState(todayStr());
  const params = useMemo(
    () => ({ employeeId: me.data?.id, from, to }),
    [me.data?.id, from, to],
  );
  const attendance = useAttendance(params);
  const checkin = useAttendanceCheckin();
  const checkout = useAttendanceCheckout();
  const presence = useAttendancePresence();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState("");
  const [range, setRange] = useState("60d");
  const now = useNow(1000);

  if (me.isLoading || attendance.isLoading) return <SectionSkeleton />;
  if (me.isError) return <SectionError onRetry={() => me.refetch()} message={me.error?.message} />;
  if (!me.data) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No employee record"
        description="Attendance tracking is only available for employees."
      />
    );
  }
  if (attendance.isError) return <SectionError onRetry={() => attendance.refetch()} message={attendance.error?.message} />;

  const today = todayStr();
  const records = attendance.data ?? [];
  const todayRecord = records.find((r) => r.date.slice(0, 10) === today);
  const canCheckin = can("hrms.attendance.checkin");
  const canCheckout = can("hrms.attendance.checkout");
  const checkedIn = Boolean(todayRecord?.checkInAt);
  const checkedOut = Boolean(todayRecord?.checkOutAt);
  // workedMinutes is only persisted at checkout — tick it live while punched in.
  const elapsedMinutes = todayRecord?.checkInAt
    ? Math.max(0, (now.getTime() - new Date(todayRecord.checkInAt).getTime()) / 60000)
    : 0;
  const activeBreakMinutes = todayRecord?.breakStartedAt
    ? Math.max(0, (now.getTime() - new Date(todayRecord.breakStartedAt).getTime()) / 60000)
    : 0;
  const breakMinutesToday = (todayRecord?.breakMinutes ?? 0) + activeBreakMinutes;
  const storedWorked = (r: AttendanceRecord) => r.workMinutes ?? r.workedMinutes ?? 0;
  const effectiveWorked = (r: AttendanceRecord) =>
    r.id === todayRecord?.id && checkedIn && !checkedOut
      ? Math.max(0, elapsedMinutes - breakMinutesToday)
      : storedWorked(r);
  const sumRange = (startDate: string, endDate: string) =>
    records
      .filter((r) => r.date.slice(0, 10) >= startDate && r.date.slice(0, 10) <= endDate)
      .reduce((acc, r) => acc + effectiveWorked(r), 0);

  const minsToday = todayRecord ? effectiveWorked(todayRecord) : 0;
  const yesterdayRecord = records.find((r) => r.date.slice(0, 10) === daysAgo(1));
  const minsYesterday = yesterdayRecord ? storedWorked(yesterdayRecord) : 0;
  const weekStartDate = new Date();
  weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() + 6) % 7));
  const weekStart = dateKey(weekStartDate);
  const prevWeekEndDate = new Date(weekStartDate);
  prevWeekEndDate.setDate(prevWeekEndDate.getDate() - 1);
  const prevWeekStartDate = new Date(prevWeekEndDate);
  prevWeekStartDate.setDate(prevWeekStartDate.getDate() - 6);
  const minsWeek = sumRange(weekStart, today);
  const minsPrevWeek = sumRange(dateKey(prevWeekStartDate), dateKey(prevWeekEndDate));
  const monthStart = today.slice(0, 7) + "-01";
  const minsMonth = sumRange(monthStart, today);
  const prevMonthEndDate = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
  const prevMonthEnd = dateKey(prevMonthEndDate);
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
  const minsPrevMonth = sumRange(prevMonthStart, prevMonthEnd);
  const overtimeMonth = records
    .filter((r) => r.date.slice(0, 10) >= monthStart)
    .reduce((acc, r) => acc + Math.max(0, effectiveWorked(r) - DAY_TARGET_MIN), 0);
  const overtimePrevMonth = records
    .filter((r) => r.date.slice(0, 10) >= prevMonthStart && r.date.slice(0, 10) <= prevMonthEnd)
    .reduce((acc, r) => acc + Math.max(0, storedWorked(r) - DAY_TARGET_MIN), 0);

  const pct = (cur: number, prev: number) =>
    prev > 0 ? ((cur - prev) / prev) * 100 : null;

  // Timeline bar (today): worked segment + overtime tail on a 06:00–20:00 axis.
  const axisMin = AXIS_START_H * 60;
  const axisSpan = (AXIS_END_H - AXIS_START_H) * 60;
  const axisTicks = Array.from({ length: AXIS_END_H - AXIS_START_H + 1 }, (_, i) => AXIS_START_H + i);
  const inMin = todayRecord?.checkInAt ? minutesOfDay(todayRecord.checkInAt) : null;
  const outMin = todayRecord?.checkOutAt
    ? minutesOfDay(todayRecord.checkOutAt)
    : todayRecord?.checkInAt
      ? now.getHours() * 60 + now.getMinutes()
      : null;
  const segStart = inMin != null ? Math.min(Math.max((inMin - axisMin) / axisSpan, 0), 1) : null;
  const segEnd = inMin != null && outMin != null ? Math.min(Math.max((outMin - axisMin) / axisSpan, 0), 1) : null;
  const productiveEnd =
    segStart != null && segEnd != null
      ? Math.min(segEnd, segStart + (minsToday / axisSpan))
      : null;
  const spanToday = inMin != null && outMin != null ? outMin - inMin : null;
  const overtimeToday = Math.max(0, minsToday - DAY_TARGET_MIN);

  const statusOptions = [
    { value: "", label: "All statuses" },
    ...[...new Set(records.map((r) => r.status))].map((s) => ({
      value: s,
      label: s.replace(/_/g, " "),
    })),
  ];

  const filtered = records.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (query && !r.date.slice(0, 10).includes(query)) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  function applyRange(v: string) {
    setRange(v);
    setPage(1);
    if (v === "custom") return;
    const days = v === "7d" ? 7 : v === "30d" ? 30 : v === "90d" ? 90 : 60;
    setFrom(daysAgo(days));
    setTo(todayStr());
  }

  function exportReport() {
    const header = ["Date", "Check In", "Check Out", "Status", "Production (min)", "Overtime (min)"];
    const lines = filtered.map((r) => {
      const worked = Math.round(effectiveWorked(r));
      return [
        r.date.slice(0, 10),
        r.checkInAt ? new Date(r.checkInAt).toISOString() : "",
        r.checkOutAt ? new Date(r.checkOutAt).toISOString() : "",
        r.status,
        String(worked),
        String(Math.max(0, worked - DAY_TARGET_MIN)),
      ].join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const firstName = getUserDisplayName(user, "there").split(" ")[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const dayProgress = Math.min(1, minsToday / DAY_TARGET_MIN);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text">My Attendance</h1>
        <button
          type="button"
          onClick={exportReport}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          <FileText className="h-4 w-4" />
          Report
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Punch card */}
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6 text-center xl:row-span-2">
          <div>
            <div className="text-sm text-text-secondary">{greeting}, {firstName}</div>
            <div className="mt-1 text-base font-semibold text-text">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })},{" "}
              {now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>

          <div
            className="flex h-28 w-28 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--success) ${dayProgress * 360}deg, var(--surface-elevated) 0deg)`,
            }}
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-lg">
                  {getUserDisplayName(user, "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          <span className="rounded bg-primary px-3 py-1 text-xs font-medium text-white">
            Production :{" "}
            {checkedIn && !checkedOut ? timerLabel(minsToday * 60) : `${hoursLabel(minsToday)} hrs`}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Fingerprint className="h-3.5 w-3.5" />
            {checkedIn ? `Punch In at ${formatTime(todayRecord?.checkInAt)}` : "Not punched in yet"}
          </span>

          <div className="flex w-full flex-col gap-2">
            {checkedIn && !checkedOut ? (
              <button
                type="button"
                disabled={!canCheckout || checkout.isPending}
                onClick={() => checkout.mutate()}
                className="h-10 w-full rounded-md bg-text text-sm font-medium text-surface disabled:opacity-50"
              >
                Punch Out
              </button>
            ) : (
              <button
                type="button"
                disabled={!canCheckin || checkin.isPending || checkedIn}
                onClick={() => checkin.mutate()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                Punch In
              </button>
            )}
            {checkedIn && !checkedOut && (
              <div className="flex justify-center gap-2">
                {(["lunch", "tea_break", "out_of_office"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={!canCheckin || presence.isPending}
                    onClick={() => presence.mutate(todayRecord?.presenceStatus === p ? null : p)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs disabled:opacity-50",
                      todayRecord?.presenceStatus === p
                        ? "border-warning bg-warning/10 text-warning"
                        : "border-border text-text-secondary hover:bg-surface-elevated",
                    )}
                  >
                    {p === "lunch" ? "Lunch" : p === "tea_break" ? "Tea break" : "OOO"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stat cards + timeline */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HoursCard icon={Clock} iconClass="bg-primary" value={minsToday} target={DAY_TARGET_MIN} label="Total Hours Today" delta={pct(minsToday, minsYesterday)} deltaLabel="Yesterday" />
            <HoursCard icon={CalendarCheck} iconClass="bg-info" value={minsWeek} target={WEEK_TARGET_MIN} label="Total Hours Week" delta={pct(minsWeek, minsPrevWeek)} deltaLabel="Last Week" />
            <HoursCard icon={FileText} iconClass="bg-success" value={minsMonth} target={MONTH_TARGET_MIN} label="Total Hours Month" delta={pct(minsMonth, minsPrevMonth)} deltaLabel="Last Month" />
            <HoursCard icon={Coffee} iconClass="bg-mention" value={overtimeMonth} target={28 * 60} label="Overtime this Month" delta={pct(overtimeMonth, overtimePrevMonth)} deltaLabel="Last Month" />
          </div>

          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                { label: "Total Working hours", value: hoursMinutesLabel(spanToday), dot: "bg-text-muted" },
                { label: "Productive Hours", value: hoursMinutesLabel(minsToday), dot: "bg-success" },
                { label: "Break hours", value: spanToday != null && minsToday != null ? hoursMinutesLabel(Math.max(0, spanToday - minsToday)) : "—", dot: "bg-warning" },
                { label: "Overtime", value: hoursMinutesLabel(overtimeToday), dot: "bg-info" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                    {s.label}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-text">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <div className="relative h-4 w-full">
                {segStart != null && segEnd != null && segEnd > segStart ? (
                  <>
                    <div
                      className="absolute top-0 h-4 rounded bg-success"
                      style={{ left: `${segStart * 100}%`, width: `${((productiveEnd ?? segEnd) - segStart) * 100}%` }}
                    />
                    {productiveEnd != null && segEnd > productiveEnd && (
                      <div
                        className="absolute top-0 h-4 rounded bg-warning"
                        style={{ left: `${productiveEnd * 100}%`, width: `${(segEnd - productiveEnd) * 100}%` }}
                      />
                    )}
                  </>
                ) : (
                  <div className="h-4 w-full rounded bg-surface-elevated" />
                )}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-text-muted">
                {axisTicks.filter((_, i) => i % 2 === 0).map((h) => (
                  <span key={h}>{String(h).padStart(2, "0")}:00</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Attendance table */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">All time Attendance</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setRange("custom"); setPage(1); }}
              className="h-8 w-36 text-xs"
            />
            <span className="text-text-muted">–</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setRange("custom"); setPage(1); }}
              className="h-8 w-36 text-xs"
            />
            <FilterDropdown
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={statusOptions}
            >
              Select Status
            </FilterDropdown>
            <FilterDropdown
              label="Sort By : "
              value={range}
              onChange={applyRange}
              options={[
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
                { value: "60d", label: "Last 60 days" },
                { value: "90d", label: "Last 90 days" },
                { value: "custom", label: "Custom range" },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>Row Per Page</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-text"
                >
                  {perPage}
                  <ChevronDown className="h-3 w-3 text-text-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {[10, 25, 50].map((n) => (
                  <DropdownMenuItem
                    key={n}
                    onClick={() => { setPerPage(n); setPage(1); }}
                    className="text-xs"
                  >
                    {n}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span>Entries</span>
          </div>
          <div className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 sm:w-56">
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search by date"
              className="w-full bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState
              icon={CalendarCheck}
              title="No attendance records"
              description="Records appear once you start checking in."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="bg-surface-elevated">
                    <th className="px-4 py-2.5 font-semibold text-text">Date</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Check In</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Check Out</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Overtime</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Production Hours</th>
                    <th className="w-28 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const worked = effectiveWorked(r);
                    const overtime = Math.max(0, worked - DAY_TARGET_MIN);
                    const good = worked >= 8 * 60;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-3 text-text">{formatDate(r.date)}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatTime(r.checkInAt)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{formatTime(r.checkOutAt)}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {overtime > 0 ? `${Math.round(overtime)} Min` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-white",
                              good ? "bg-success" : "bg-error",
                            )}
                          >
                            <Clock className="h-3 w-3" />
                            {r.id === todayRecord?.id && checkedIn && !checkedOut
                              ? timerLabel(minsToday * 60)
                              : `${hoursLabel(worked)} Hrs`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.date.slice(0, 10) !== today && canCheckin ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRecord(r);
                                setCorrectionOpen(true);
                              }}
                            >
                              Request correction
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-sm text-text-secondary">
                Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1} to{" "}
                {Math.min(filtered.length, page * perPage)} of {filtered.length} entries
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="flex h-7 w-7 items-center justify-center text-text-muted disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(4, pages) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs",
                      page === n ? "bg-primary text-white" : "text-text hover:bg-surface-elevated",
                    )}
                  >
                    {n}
                  </button>
                ))}
                {pages > 4 && <span className="px-1 text-xs text-text-muted">…</span>}
                {pages > 4 && (
                  <button
                    type="button"
                    onClick={() => setPage(pages)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-text hover:bg-surface-elevated"
                  >
                    {pages}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pages, page + 1))}
                  disabled={page === pages}
                  className="flex h-7 w-7 items-center justify-center text-text-muted disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <RequestCorrectionDialog
        record={selectedRecord}
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
      />
    </div>
  );
}
