import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Flag,
  LogIn,
  LogOut,
  Search,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Button } from "@teamspace-one/ui/button";
import {
  useAttendanceAll,
  useAttendanceCorrections,
  useDepartments,
  useEmployees,
  useHolidays,
  useLeaveRequests,
  useReviewAttendanceCorrection,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import type { AttendanceRecord, Employee } from "../../lib/api";
import { FilterDropdown, PageHeader, Pagination } from "./common";
import { SectionError, SectionSkeleton, formatTime } from "../hrms/common";
import { cn } from "../../lib/utils";

/* =========================================================
   CONSTANTS & HELPERS
========================================================= */

const PAGE_SIZE = 10;
/** Full working day: 8h. >=9h counts as overtime, <8h as a partial day. */
const DAY_TARGET_MIN = 8 * 60;
const OVERTIME_MIN = 9 * 60;

type CellKind =
  | "work"
  | "overtime"
  | "leave"
  | "holiday"
  | "wfh"
  | "halfday"
  | "absent"
  | "off"
  | "notlogged"
  | "future";

interface DayColumn {
  key: string; // YYYY-MM-DD (local)
  weekday: string;
  dayNum: string;
  weekend: boolean;
  future: boolean;
}

interface Cell {
  value: string;
  kind: CellKind;
  record?: AttendanceRecord;
  title?: string;
}

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dayKeyOf(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localKey(d);
}

function todayKey() {
  return localKey(new Date());
}

function monthDays(anchor: Date): DayColumn[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const today = todayKey();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month, i + 1);
    const dow = d.getDay();
    return {
      key: localKey(d),
      weekday: d.toLocaleDateString([], { weekday: "short" }),
      dayNum: String(i + 1).padStart(2, "0"),
      weekend: dow === 0 || dow === 6,
      future: localKey(d) > today,
    };
  });
}

function weekDays(anchor: Date): DayColumn[] {
  const start = new Date(anchor);
  const dow = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - dow);
  const today = todayKey();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const w = d.getDay();
    return {
      key: localKey(d),
      weekday: d.toLocaleDateString([], { weekday: "short" }),
      dayNum: String(d.getDate()).padStart(2, "0"),
      weekend: w === 0 || w === 6,
      future: localKey(d) > today,
    };
  });
}

function hoursLabel(mins: number) {
  const h = mins / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

function hoursMinutesLabel(mins: number | null) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function initials(e: Employee) {
  return `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function employeeName(e: Employee) {
  return `${e.firstName} ${e.lastName}`.trim();
}

const CELL_STYLES: Record<CellKind, string> = {
  work: "text-text-secondary",
  overtime: "bg-success/10 text-success font-semibold rounded-md",
  leave: "bg-error/10 text-error font-semibold rounded-md",
  holiday: "text-text-muted",
  wfh: "bg-info/10 text-info font-semibold rounded-md",
  halfday: "bg-warning/10 text-warning font-semibold rounded-md",
  absent: "bg-error/10 text-error font-semibold rounded-md",
  off: "text-text-muted",
  notlogged: "bg-surface-elevated text-text-muted rounded-md",
  future: "text-text-muted/50",
};

/** workedMinutes is only persisted at checkout — derive a live value while punched in today. */
function effectiveMinutes(record: AttendanceRecord, day: string) {
  if (record.workedMinutes != null) return record.workedMinutes;
  if (record.checkInAt && day === todayKey()) {
    return Math.max(0, (Date.now() - new Date(record.checkInAt).getTime()) / 60000);
  }
  return null;
}

function classifyCell({
  day,
  record,
  onLeave,
  holiday,
}: {
  day: DayColumn;
  record?: AttendanceRecord;
  onLeave?: string;
  holiday?: string;
}): Cell {
  if (day.future) return { value: "–", kind: "future" };
  if (record) {
    const status = (record.status ?? "").toLowerCase();
    if (status === "absent") return { value: "A", kind: "absent", record };
    if (status === "leave") return { value: "L", kind: "leave", record };
    const mins = effectiveMinutes(record, day.key);
    if (status === "wfh" || status === "remote") {
      return { value: mins != null ? hoursLabel(mins) : "WFH", kind: "wfh", record };
    }
    if (status === "half_day") {
      return { value: mins != null ? hoursLabel(mins) : "HD", kind: "halfday", record };
    }
    if (mins != null) {
      if (mins >= OVERTIME_MIN) return { value: hoursLabel(mins), kind: "overtime", record };
      if (mins >= DAY_TARGET_MIN) return { value: hoursLabel(mins), kind: "work", record };
      return { value: hoursLabel(mins), kind: "halfday", record };
    }
    if (record.checkInAt) return { value: "In", kind: "work", record, title: "Checked in" };
    return { value: "–", kind: "notlogged", record };
  }
  if (onLeave) return { value: "L", kind: "leave", title: onLeave };
  if (holiday) return { value: "H", kind: "holiday", title: holiday };
  if (day.weekend) return { value: "–", kind: "off" };
  return { value: "·", kind: "notlogged", title: "Not logged" };
}

/* =========================================================
   SMALL PIECES
========================================================= */

function KpiCard({
  icon: Icon,
  iconClass,
  title,
  value,
  detail,
}: {
  icon: React.ElementType;
  iconClass: string;
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-4">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          iconClass,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-secondary">{title}</p>
        <p className="mt-0.5 truncate text-xl font-semibold tracking-tight text-text">{value}</p>
        {detail && <p className="mt-0.5 text-[11px] text-text-muted">{detail}</p>}
      </div>
    </div>
  );
}

const LEGEND: [string, string][] = [
  ["Work Hours", "bg-text-muted"],
  ["Overtime", "bg-success"],
  ["Leave", "bg-error/60"],
  ["Holiday", "bg-text-muted/50"],
  ["WFH", "bg-info"],
  ["Half Day", "bg-warning"],
  ["Absent", "bg-error"],
  ["Not Logged", "bg-surface-elevated"],
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {LEGEND.map(([label, color]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full border border-border", color)} />
          <span className="text-[11px] text-text-secondary">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   DAY DETAIL PANEL
========================================================= */

function DayPanel({
  employee,
  day,
  cell,
  monthMins,
  monthLeaves,
  daysLogged,
  onPrevDay,
  onNextDay,
  canPrev,
  canNext,
}: {
  employee: Employee | null;
  day: string | null;
  cell: Cell | null;
  monthMins: number;
  monthLeaves: number;
  daysLogged: number;
  onPrevDay: () => void;
  onNextDay: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const [tab, setTab] = useState<"day" | "summary">("day");
  const record = cell?.record;
  const mins = record && day ? effectiveMinutes(record, day) : null;
  const dayLabel = day
    ? new Date(`${day}T00:00:00`).toLocaleDateString([], {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <aside className="self-start rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="text-xs font-semibold">
            {employee ? initials(employee) : "—"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">
            {employee ? employeeName(employee) : "Select a day cell"}
          </h3>
          <p className="truncate text-xs text-text-secondary">
            {employee?.designation?.title ?? employee?.designationName ?? employee?.departmentName ?? ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-border">
        {(["day", "summary"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "relative py-3 text-xs font-medium",
              tab === t ? "text-primary" : "text-text-secondary",
            )}
          >
            {t === "day" ? "Day View" : "Summary"}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "day" ? (
        <>
          <div className="flex items-center gap-2 p-4">
            <button
              type="button"
              onClick={onPrevDay}
              disabled={!canPrev}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex h-9 flex-1 items-center justify-center rounded-lg bg-surface-elevated text-xs font-medium text-text">
              {dayLabel}
            </div>
            <button
              type="button"
              onClick={onNextDay}
              disabled={!canNext}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between px-4">
            <span className="text-xs font-medium text-text-secondary">Total Hours</span>
            <span className="text-sm font-semibold text-text">{hoursMinutesLabel(mins)}</span>
          </div>

          <div className="mt-3 px-4 pb-4">
            {record ? (
              <>
                <PanelRow
                  icon={LogIn}
                  iconClass="bg-success/10 text-success"
                  title="Checked in"
                  value={formatTime(record.checkInAt)}
                />
                <PanelRow
                  icon={LogOut}
                  iconClass="bg-info/10 text-info"
                  title="Checked out"
                  value={formatTime(record.checkOutAt)}
                />
                <PanelRow
                  icon={Clock3}
                  iconClass="bg-primary-subtle text-primary"
                  title="Worked"
                  value={hoursMinutesLabel(mins)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded bg-surface-elevated px-2 py-1 text-[11px] font-medium capitalize text-text-secondary">
                    {(record.status ?? "present").replace(/_/g, " ")}
                  </span>
                  {record.presenceStatus && (
                    <span className="rounded bg-warning/10 px-2 py-1 text-[11px] font-medium capitalize text-warning">
                      {record.presenceStatus.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </>
            ) : cell?.kind === "leave" ? (
              <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                On leave{cell.title ? ` — ${cell.title}` : ""}
              </p>
            ) : cell?.kind === "holiday" ? (
              <p className="rounded-lg bg-surface-elevated px-3 py-2 text-xs text-text-secondary">
                Holiday{cell.title ? ` — ${cell.title}` : ""}
              </p>
            ) : (
              <p className="rounded-lg bg-surface-elevated px-3 py-2 text-xs text-text-muted">
                No timesheet entries for this day.
              </p>
            )}
          </div>

          {record?.createdAt && (
            <div className="border-t border-border px-4 py-4">
              <h4 className="text-xs font-semibold text-text">Activity</h4>
              <div className="mt-3 flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-medium text-text">Attendance recorded</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    {new Date(record.createdAt).toLocaleString([], {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 p-4">
          {[
            { label: "Hours in period", value: hoursMinutesLabel(monthMins) },
            { label: "Days logged", value: String(daysLogged) },
            {
              label: "Avg. per logged day",
              value: daysLogged > 0 ? hoursMinutesLabel(monthMins / daysLogged) : "—",
            },
            { label: "Leave days in period", value: String(monthLeaves) },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{row.label}</span>
              <span className="font-medium text-text">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function PanelRow({
  icon: Icon,
  iconClass,
  title,
  value,
}: {
  icon: React.ElementType;
  iconClass: string;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", iconClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="flex-1 text-xs font-medium text-text">{title}</span>
      <span className="text-xs text-text-secondary">{value}</span>
    </div>
  );
}

/* =========================================================
   APPROVALS TAB
========================================================= */

function ApprovalsTab() {
  const { can } = usePermissions();
  const corrections = useAttendanceCorrections("pending");
  const review = useReviewAttendanceCorrection();
  const canApprove = can("hrms.attendance.approve");

  if (corrections.isLoading) return <div className="p-5"><SectionSkeleton rows={3} /></div>;
  if (corrections.isError)
    return <SectionError onRetry={() => corrections.refetch()} message={corrections.error?.message} />;

  const list = (corrections.data ?? []).filter((c) => (c.status ?? "pending") === "pending");

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <FileText className="h-8 w-8 text-text-muted" />
        <p className="text-sm font-medium text-text">No pending approvals</p>
        <p className="text-xs text-text-muted">Timesheet correction requests will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-surface-elevated text-text-secondary">
            <th className="px-5 py-3 font-medium">Employee</th>
            <th className="px-5 py-3 font-medium">Date</th>
            <th className="px-5 py-3 font-medium">Requested check-in</th>
            <th className="px-5 py-3 font-medium">Requested check-out</th>
            <th className="px-5 py-3 font-medium">Reason</th>
            {canApprove && <th className="px-5 py-3 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <td className="px-5 py-3 font-medium text-text">{c.employeeName ?? "—"}</td>
              <td className="px-5 py-3 text-text-secondary">{dayKeyOf(c.date) ?? "—"}</td>
              <td className="px-5 py-3 text-text-secondary">{formatTime(c.requestedCheckInAt)}</td>
              <td className="px-5 py-3 text-text-secondary">{formatTime(c.requestedCheckOutAt)}</td>
              <td className="max-w-[240px] truncate px-5 py-3 text-text-secondary" title={c.reason ?? ""}>
                {c.reason ?? "—"}
              </td>
              {canApprove && (
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: c.id, action: "approve" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: c.id, action: "reject" })}
                    >
                      Reject
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   MAIN SCREEN
========================================================= */

export function HrTimesheetsScreen() {
  const [mode, setMode] = useState<"week" | "month">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [tab, setTab] = useState<"timesheet" | "approvals">("timesheet");
  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ employeeId: string; day: string } | null>(null);

  const days = useMemo(
    () => (mode === "month" ? monthDays(anchor) : weekDays(anchor)),
    [mode, anchor],
  );
  const from = days[0]?.key ?? todayKey();
  const to = days[days.length - 1]?.key ?? todayKey();

  const employees = useEmployees();
  const departments = useDepartments();
  const attendance = useAttendanceAll({ from, to });
  const leaveRequests = useLeaveRequests();
  const holidays = useHolidays();
  const corrections = useAttendanceCorrections("pending");

  /* ---------- lookups ---------- */

  const attendanceByKey = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of attendance.data ?? []) {
      const key = dayKeyOf(r.date);
      if (key) map.set(`${r.employeeId}:${key}`, r);
    }
    return map;
  }, [attendance.data]);

  const leaveByEmployee = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const r of leaveRequests.data ?? []) {
      if (r.status !== "approved") continue;
      const start = dayKeyOf(r.startDate);
      const end = dayKeyOf(r.endDate);
      if (!start || !end) continue;
      const d = new Date(`${start}T00:00:00`);
      const endD = new Date(`${end}T00:00:00`);
      for (let i = 0; i < 400 && d <= endD; i++) {
        if (!map.has(r.employeeId)) map.set(r.employeeId, new Map());
        map.get(r.employeeId)!.set(localKey(d), r.leaveTypeName ?? "Leave");
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [leaveRequests.data]);

  const holidayByDay = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays.data ?? []) {
      const key = dayKeyOf(h.date);
      if (key) map.set(key, h.name);
    }
    return map;
  }, [holidays.data]);

  /* ---------- filtered employees ---------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (employees.data ?? []).filter((e) => {
      if (departmentId && e.departmentId !== departmentId) return false;
      if (!q) return true;
      return (
        employeeName(e).toLowerCase().includes(q) ||
        (e.departmentName ?? e.department?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees.data, query, departmentId]);

  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ---------- cells + totals ---------- */

  const cellFor = (employeeId: string, day: DayColumn): Cell =>
    classifyCell({
      day,
      record: attendanceByKey.get(`${employeeId}:${day.key}`),
      onLeave: leaveByEmployee.get(employeeId)?.get(day.key),
      holiday: holidayByDay.get(day.key),
    });

  const totalMins = (employeeId: string) =>
    days.reduce((acc, day) => {
      const r = attendanceByKey.get(`${employeeId}:${day.key}`);
      return acc + (r ? (effectiveMinutes(r, day.key) ?? 0) : 0);
    }, 0);

  /* ---------- KPIs ---------- */

  const kpis = useMemo(() => {
    let total = 0;
    let overtime = 0;
    let leaveDays = 0;
    const activeIds = new Set<string>();
    for (const e of filtered) {
      let empMins = 0;
      for (const day of days) {
        const r = attendanceByKey.get(`${e.id}:${day.key}`);
        const mins = r ? (effectiveMinutes(r, day.key) ?? 0) : 0;
        if (mins > 0) activeIds.add(e.id);
        empMins += mins;
        overtime += Math.max(0, mins - DAY_TARGET_MIN);
        if (leaveByEmployee.get(e.id)?.has(day.key)) leaveDays += 1;
      }
      total += empMins;
    }
    return {
      total,
      overtime,
      active: activeIds.size,
      leaveDays,
      pending: (corrections.data ?? []).filter((c) => (c.status ?? "pending") === "pending").length,
    };
  }, [filtered, days, attendanceByKey, leaveByEmployee, corrections.data]);

  /* ---------- range label + nav ---------- */

  const rangeLabel =
    mode === "month"
      ? anchor.toLocaleDateString([], { month: "long", year: "numeric" })
      : `${new Date(`${from}T00:00:00`).toLocaleDateString([], { day: "2-digit", month: "short" })} – ${new Date(
          `${to}T00:00:00`,
        ).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}`;

  function shift(dir: -1 | 1) {
    const d = new Date(anchor);
    if (mode === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setAnchor(d);
    setSelected(null);
  }

  /* ---------- export ---------- */

  function exportCsv() {
    const header = ["Employee", "Department", ...days.map((d) => d.key), "Total (min)"];
    const lines = filtered.map((e) => {
      const cells = days.map((day) => {
        const r = attendanceByKey.get(`${e.id}:${day.key}`);
        return String(Math.round(r ? (effectiveMinutes(r, day.key) ?? 0) : 0));
      });
      return [
        employeeName(e),
        e.departmentName ?? e.department?.name ?? "",
        ...cells,
        String(Math.round(totalMins(e.id))),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheets-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- selection ---------- */

  const selectedEmployee = selected
    ? (filtered.find((e) => e.id === selected.employeeId) ?? employees.data?.find((e) => e.id === selected.employeeId) ?? null)
    : null;
  const selectedDay = selected ? (days.find((d) => d.key === selected.day) ?? null) : null;
  const selectedCell =
    selected && selectedDay ? cellFor(selected.employeeId, selectedDay) : null;
  const selectedIndex = selected ? days.findIndex((d) => d.key === selected.day) : -1;

  const gridTemplate = `200px repeat(${days.length},minmax(52px,1fr)) 80px`;
  const loading = employees.isLoading || attendance.isLoading;
  const loadError = employees.isError ? employees.error : attendance.isError ? attendance.error : null;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Timesheets" crumbs={["HRMS", "Timesheets"]}>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text"
        >
          <CalendarDays className="h-4 w-4 text-text-muted" />
          {rangeLabel}
        </button>
        <FilterDropdown
          label="Department"
          value={departmentId}
          onChange={(v) => {
            setDepartmentId(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "All departments" },
            ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        <button
          type="button"
          onClick={exportCsv}
          className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </PageHeader>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={Clock3}
          iconClass="bg-primary-subtle text-primary"
          title="Total Hours"
          value={`${Math.round(kpis.total / 60).toLocaleString()}h`}
          detail={`in ${mode === "month" ? rangeLabel : "selected week"}`}
        />
        <KpiCard
          icon={Check}
          iconClass="bg-success/10 text-success"
          title="Overtime Hours"
          value={`${Math.round(kpis.overtime / 60).toLocaleString()}h`}
          detail={`beyond ${DAY_TARGET_MIN / 60}h/day`}
        />
        <KpiCard
          icon={Users}
          iconClass="bg-info/10 text-info"
          title="Active Employees"
          value={String(kpis.active)}
          detail={`of ${filtered.length} in filter`}
        />
        <KpiCard
          icon={CalendarDays}
          iconClass="bg-warning/10 text-warning"
          title="Leave Days"
          value={String(kpis.leaveDays)}
          detail="approved, in period"
        />
        <KpiCard
          icon={Flag}
          iconClass="bg-error/10 text-error"
          title="Pending Approval"
          value={String(kpis.pending)}
          detail="timesheet corrections"
        />
      </div>

      {/* Main content */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-border px-5">
            {(
              [
                { id: "timesheet", label: "Timesheet" },
                { id: "approvals", label: `Approvals${kpis.pending ? ` (${kpis.pending})` : ""}` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative py-3.5 text-xs font-medium",
                  tab === t.id ? "text-primary" : "text-text-secondary",
                )}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>

          {tab === "approvals" ? (
            <ApprovalsTab />
          ) : (
            <>
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
                <div className="relative w-60">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search employee..."
                    className="h-9 w-full rounded-md border border-border bg-surface-elevated pl-9 pr-3 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary"
                  />
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <div className="flex rounded-md border border-border p-0.5">
                    {(["week", "month"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                          "rounded px-4 py-1.5 text-xs capitalize",
                          mode === m ? "bg-primary font-medium text-white" : "text-text-secondary",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAnchor(new Date());
                      setSelected(null);
                    }}
                    className="h-9 rounded-md border border-border px-4 text-xs font-medium text-primary"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => shift(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-32 px-1 text-center text-xs font-medium text-text">
                    {rangeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => shift(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="p-5">
                  <SectionSkeleton rows={6} />
                </div>
              ) : loadError ? (
                <SectionError
                  onRetry={() => {
                    employees.refetch();
                    attendance.refetch();
                  }}
                  message={loadError.message}
                />
              ) : (
                <>
                  {/* Grid */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      <div
                        className="grid border-b border-border bg-surface-elevated"
                        style={{ gridTemplateColumns: gridTemplate }}
                      >
                        <div className="flex items-center px-4 py-2 text-xs font-medium text-text-secondary">
                          Employee
                        </div>
                        {days.map((d) => (
                          <div
                            key={d.key}
                            className={cn(
                              "flex flex-col items-center justify-center border-l border-border py-2",
                              d.key === todayKey() && "bg-primary-subtle",
                            )}
                          >
                            <span className="text-[10px] text-text-muted">{d.weekday}</span>
                            <span className="mt-0.5 text-xs font-medium text-text">{d.dayNum}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-center border-l border-border text-xs font-medium text-text-secondary">
                          Total
                        </div>
                      </div>

                      {rows.length === 0 && (
                        <div className="p-8 text-center text-xs text-text-muted">
                          No employees match the current filters.
                        </div>
                      )}

                      {rows.map((e) => {
                        const isSelectedRow = selected?.employeeId === e.id;
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              "grid border-b border-border last:border-0",
                              isSelectedRow && "bg-primary-subtle/40",
                            )}
                            style={{ gridTemplateColumns: gridTemplate }}
                          >
                            <div className="flex items-center gap-2 px-4 py-1.5">
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarFallback className="text-[10px] font-semibold">
                                  {initials(e)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-text">
                                  {employeeName(e)}
                                </p>
                                <p className="truncate text-[11px] text-text-muted">
                                  {e.departmentName ?? e.department?.name ?? "—"}
                                </p>
                              </div>
                            </div>
                            {days.map((day) => {
                              const cell = cellFor(e.id, day);
                              const isSelected =
                                selected?.employeeId === e.id && selected.day === day.key;
                              return (
                                <div key={day.key} className="border-l border-border p-1">
                                  <button
                                    type="button"
                                    title={cell.title ?? `${employeeName(e)} — ${day.key}`}
                                    onClick={() => setSelected({ employeeId: e.id, day: day.key })}
                                    className={cn(
                                      "flex h-9 w-full items-center justify-center text-[11px] transition hover:opacity-80",
                                      CELL_STYLES[cell.kind],
                                      isSelected && "ring-1 ring-primary",
                                    )}
                                  >
                                    {cell.value}
                                  </button>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-center border-l border-border text-xs font-semibold text-text-secondary">
                              {hoursLabel(totalMins(e.id))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex flex-col gap-3 border-t border-border px-5 py-3 lg:flex-row lg:items-center">
                    <Legend />
                  </div>
                  <Pagination
                    page={page}
                    total={filtered.length}
                    perPage={PAGE_SIZE}
                    onPage={setPage}
                  />
                </>
              )}
            </>
          )}
        </div>

        <DayPanel
          employee={selectedEmployee}
          day={selected?.day ?? null}
          cell={selectedCell}
          monthMins={selectedEmployee ? totalMins(selectedEmployee.id) : 0}
          monthLeaves={
            selectedEmployee
              ? days.filter((d) => leaveByEmployee.get(selectedEmployee.id)?.has(d.key)).length
              : 0
          }
          daysLogged={
            selectedEmployee
              ? days.filter((d) => {
                  const r = attendanceByKey.get(`${selectedEmployee.id}:${d.key}`);
                  return r != null && (effectiveMinutes(r, d.key) ?? 0) > 0;
                }).length
              : 0
          }
          canPrev={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < days.length - 1}
          onPrevDay={() =>
            selectedIndex > 0 &&
            setSelected({ employeeId: selected!.employeeId, day: days[selectedIndex - 1].key })
          }
          onNextDay={() =>
            selectedIndex >= 0 &&
            selectedIndex < days.length - 1 &&
            setSelected({ employeeId: selected!.employeeId, day: days[selectedIndex + 1].key })
          }
        />
      </div>
    </div>
  );
}
