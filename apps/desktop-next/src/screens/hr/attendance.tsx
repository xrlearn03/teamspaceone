import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  MoreVertical,
  Plane,
  Search,
  Users,
  UserX,
  X,
} from "lucide-react";
import {
  useAttendanceAll,
  useEmployees,
  useHrmsOverview,
  useLeaveRequests,
} from "@/hooks/api";
import type { AttendanceRecord, Employee, LeaveRequest } from "@/lib/api";
import { useUIStore } from "@/stores/ui";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { FilterDropdown, PageHeader, Pagination } from "./common";
import {
  SectionError,
  SectionSkeleton,
  formatMinutes,
  formatTime,
} from "@/screens/hrms/common";
import { cn } from "@/lib/utils";

/* =========================================================
   HELPERS
========================================================= */

type DayStatus = "Present" | "Late" | "Absent" | "On Leave";
type RangeId = "today" | "week" | "month" | "custom";

/** Check-ins after this time of day count as "Late" (no shift config exists yet). */
const LATE_AFTER_MINUTES = 9 * 60 + 30;
const PAGE_SIZE = 10;

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "Present", label: "Present" },
  { value: "Absent", label: "Absent" },
  { value: "Late", label: "Late" },
  { value: "On Leave", label: "On Leave" },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayKey(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d.toISOString())!;
}

function eachDay(from: string, to: string) {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

function rangeDates(range: RangeId, customFrom: string, customTo: string) {
  const today = todayStr();
  if (range === "today") return { from: today, to: today };
  if (range === "week") return { from: addDays(today, -((new Date().getDay() + 6) % 7)), to: today };
  if (range === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: customFrom, to: customTo < customFrom ? customFrom : customTo };
}

function fmtDay(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });
}

function fmtRangeDay(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function minutesOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function initials(e: Employee) {
  return `${e.firstName ?? ""} ${e.lastName ?? ""}`
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function employeeName(e: Employee) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function leaveCovers(r: LeaveRequest, key: string) {
  const start = dayKey(r.startDate);
  const end = dayKey(r.endDate);
  return start !== null && end !== null && start <= key && end >= key;
}

function workedMinutes(rec: AttendanceRecord | undefined, now: number) {
  if (!rec) return null;
  const stored = rec.workedMinutes ?? (rec as AttendanceRecord & { workMinutes?: number | null }).workMinutes;
  if (stored != null) return stored;
  if (rec.checkInAt && !rec.checkOutAt) {
    return Math.max(0, Math.round((now - new Date(rec.checkInAt).getTime()) / 60000));
  }
  return null;
}

function statusOf(rec: AttendanceRecord | undefined, onLeave: boolean): DayStatus {
  if (rec) {
    const s = (rec.status ?? "").toLowerCase();
    if (s === "absent") return "Absent";
    if (s === "on_leave" || s === "leave") return "On Leave";
    if (s === "late") return "Late";
    if (rec.checkInAt && minutesOfDay(rec.checkInAt) > LATE_AFTER_MINUTES) return "Late";
    return "Present";
  }
  return onLeave ? "On Leave" : "Absent";
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/* =========================================================
   SMALL PIECES
========================================================= */

const STATUS_STYLES: Record<DayStatus, string> = {
  Present: "bg-success/10 text-success",
  Absent: "bg-error/10 text-error",
  Late: "bg-warning/10 text-warning",
  "On Leave": "bg-mention/10 text-mention",
};

const STATUS_DOT: Record<DayStatus, string> = {
  Present: "bg-success",
  Absent: "bg-error",
  Late: "bg-warning",
  "On Leave": "bg-mention",
};

function AttendanceStatusBadge({ status }: { status: DayStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium",
        STATUS_STYLES[status],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {status}
    </span>
  );
}

function KpiCard({
  icon,
  iconClass,
  title,
  value,
  bottom,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  value: string;
  bottom?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-[0_2px_14px_rgba(20,50,90,.025)]">
      <div className="flex items-center gap-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", iconClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-text-secondary">{title}</p>
          <p className="mt-1 text-[25px] font-semibold tracking-tight text-text">{value}</p>
          {bottom && <p className="mt-0.5 text-[10px] text-text-muted">{bottom}</p>}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ATTENDANCE TREND
========================================================= */

interface TrendDay {
  key: string;
  present: number;
  absent: number;
  leave: number;
  late: number;
}

const TREND_SEGMENTS: { key: keyof Omit<TrendDay, "key">; label: string; className: string }[] = [
  { key: "present", label: "Present", className: "bg-success" },
  { key: "absent", label: "Absent", className: "bg-error" },
  { key: "leave", label: "On Leave", className: "bg-mention" },
  { key: "late", label: "Late", className: "bg-warning" },
];

function AttendanceTrend({ days }: { days: TrendDay[] }) {
  const maxValue = Math.max(1, ...days.map((d) => d.present + d.absent + d.leave + d.late));
  const gridLines = [0, 0.5, 1].map((f) => Math.round(maxValue * f));
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">Attendance Trend</h2>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
        {TREND_SEGMENTS.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[10px] text-text-secondary">
            <span className={cn("h-2.5 w-2.5 rounded-full", s.className)} />
            {s.label}
          </div>
        ))}
      </div>

      <div className="relative mt-4 h-[210px]">
        {gridLines.map((value) => (
          <div
            key={value}
            className="absolute left-8 right-0 border-t border-border"
            style={{ bottom: `${(value / maxValue) * 100}%` }}
          >
            <span className="absolute -left-8 -top-2 text-[9px] text-text-muted">{value}</span>
          </div>
        ))}

        <div className="absolute inset-0 bottom-0 left-10 flex items-end justify-between gap-[4px] pr-1 pt-5">
          {days.map((day) => {
            const total = day.present + day.absent + day.leave + day.late;
            return (
              <div
                key={day.key}
                title={`${fmtDay(day.key)} — ${total} employees`}
                className="flex h-full max-w-[18px] flex-1 flex-col justify-end"
              >
                <div
                  className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm"
                  style={{ height: `${(total / maxValue) * 100}%` }}
                >
                  {TREND_SEGMENTS.map((s) => (
                    <div
                      key={s.key}
                      className={cn("w-full", s.className)}
                      style={{ height: total ? `${(day[s.key] / total) * 100}%` : 0 }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {days.length === 0 && (
            <p className="w-full self-center text-center text-xs text-text-muted">No data in this range.</p>
          )}
        </div>

        <div className="absolute bottom-[-22px] left-10 right-0 flex justify-between">
          {days.map((day, i) =>
            i % labelEvery === 0 || i === days.length - 1 ? (
              <span key={day.key} className="text-[9px] text-text-muted">
                {fmtDay(day.key)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   DONUT
========================================================= */

function AttendanceDistribution({
  total,
  counts,
}: {
  total: number;
  counts: Record<DayStatus, number>;
}) {
  const segments: { label: DayStatus; value: number; color: string }[] = [
    { label: "Present", value: counts.Present, color: "var(--success)" },
    { label: "Absent", value: counts.Absent, color: "var(--error)" },
    { label: "On Leave", value: counts["On Leave"], color: "var(--mention)" },
    { label: "Late", value: counts.Late, color: "var(--warning)" },
  ];
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const sum = segments.reduce((acc, s) => acc + s.value, 0);
  let accumulated = 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">Attendance Distribution</h2>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
        <div className="relative h-[160px] w-[160px] shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--surface-elevated)" strokeWidth="13" />
            {sum > 0 &&
              segments.map((segment) => {
                const length = (segment.value / sum) * circumference;
                const offset = circumference - accumulated - length;
                accumulated += length;
                if (length <= 0) return null;
                return (
                  <circle
                    key={segment.label}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[25px] font-semibold text-text">{total}</span>
            <span className="text-[10px] text-text-muted">Employees</span>
          </div>
        </div>

        <div className="space-y-4">
          {segments.map((segment) => (
            <div key={segment.label} className="grid grid-cols-[12px_1fr_30px] items-center gap-2 text-[10px]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="text-text-secondary">
                {segment.label}{" "}
                <span className="ml-2">{sum ? ((segment.value / sum) * 100).toFixed(1) : "0.0"}%</span>
              </span>
              <span className="text-right font-medium text-text">{segment.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   DEPARTMENT-WISE
========================================================= */

function DepartmentAttendance({
  rows,
}: {
  rows: { name: string; present: number; total: number }[];
}) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">Department-wise Attendance</h2>

      <div className="mt-3">
        <div className="grid grid-cols-[1fr_80px_100px] bg-surface-elevated px-2 py-2 text-[10px] text-text-secondary">
          <span>Department</span>
          <span>Present %</span>
          <span>Total</span>
        </div>
        <div className="max-h-[290px] overflow-y-auto">
          {rows.map((department) => (
            <div
              key={department.name}
              className="grid grid-cols-[1fr_80px_100px] items-center border-b border-border px-2 py-2.5 last:border-0"
            >
              <span className="truncate text-[10px] text-text-secondary">{department.name}</span>
              <span className="text-[10px] font-medium text-success">{department.present}%</span>
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-[65px] overflow-hidden rounded-full bg-surface-elevated">
                  <div className="h-full rounded-full bg-success" style={{ width: `${department.present}%` }} />
                </div>
                <span className="text-[10px] text-text-muted">{department.total}</span>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="py-6 text-center text-xs text-text-muted">No departments yet.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setActiveView("departments")}
        className="mt-2 flex w-full items-center justify-end gap-1 text-[10px] font-medium text-primary hover:underline"
      >
        View All
      </button>
    </div>
  );
}

/* =========================================================
   EMPLOYEE TABLE
========================================================= */

interface TableRow {
  employee: Employee;
  record?: AttendanceRecord;
  status: DayStatus;
  department: string;
  location: string;
}

function EmployeeTable({
  rows,
  isLoading,
  isError,
  onRetry,
  now,
}: {
  rows: TableRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  now: number;
}) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, pages);
  const pageRows = rows.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      {isLoading ? (
        <div className="p-5">
          <SectionSkeleton rows={6} />
        </div>
      ) : isError ? (
        <SectionError onRetry={onRetry} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead>
                <tr className="bg-surface-elevated text-[10px] font-medium text-text-secondary">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="h-4 w-4 rounded border-border" />
                  </th>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">Employee ID</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Status (Today)</th>
                  <th className="px-3 py-3">Check In</th>
                  <th className="px-3 py-3">Check Out</th>
                  <th className="px-3 py-3">Working Hours</th>
                  <th className="w-12 px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.employee.id} className="border-t border-border hover:bg-surface-elevated/60">
                    <td className="px-4 py-2.5">
                      <input type="checkbox" className="h-4 w-4 rounded border-border" />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] font-semibold">
                            {initials(row.employee)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-text">{employeeName(row.employee)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">
                      {row.employee.employeeNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">{row.department || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">{row.location || "—"}</td>
                    <td className="px-3 py-2.5">
                      <AttendanceStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">{formatTime(row.record?.checkInAt)}</td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">{formatTime(row.record?.checkOutAt)}</td>
                    <td className="px-3 py-2.5 text-xs text-text-secondary">
                      {formatMinutes(workedMinutes(row.record, now))}
                    </td>
                    <td className="px-3 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-elevated"
                          >
                            <MoreVertical size={15} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setActiveView("employee-detail", { employeeId: row.employee.id })}
                            className="gap-2 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5" /> View employee
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-xs text-text-muted">
                      No employees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-stretch">
            <div className="min-w-0 flex-1">
              <Pagination page={safePage} total={rows.length} perPage={perPage} onPage={setPage} />
            </div>
            <div className="flex items-center border-t border-border px-4">
              <FilterDropdown
                value={String(perPage)}
                onChange={(v) => {
                  setPerPage(Number(v));
                  setPage(1);
                }}
                options={[
                  { value: "10", label: "Show 10 per page" },
                  { value: "25", label: "Show 25 per page" },
                  { value: "50", label: "Show 50 per page" },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* =========================================================
   TABLE FILTERS (shared between toolbar + export)
========================================================= */

interface TableFilters {
  search: string;
  department: string;
  location: string;
  status: string;
}

function applyFilters(rows: TableRow[], filters: TableFilters) {
  return rows.filter((row) => {
    if (filters.department && row.department !== filters.department) return false;
    if (filters.location && row.location !== filters.location) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (
        employeeName(row.employee).toLowerCase().includes(q) ||
        (row.employee.employeeNumber ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });
}

/* =========================================================
   MAIN
========================================================= */

export function HrAttendanceScreen() {
  const [range, setRange] = useState<RangeId>("month");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [filters, setFilters] = useState<TableFilters>({ search: "", department: "", location: "", status: "" });
  const { from, to } = useMemo(() => rangeDates(range, customFrom, customTo), [range, customFrom, customTo]);

  const employees = useEmployees();
  const overview = useHrmsOverview();
  const attendance = useAttendanceAll({ from, to });
  const leaveRequests = useLeaveRequests();
  const now = Date.now();
  const today = todayStr();

  const activeEmployees = useMemo(
    () => (employees.data ?? []).filter((e) => (e.status ?? "active") !== "terminated"),
    [employees.data],
  );

  const days = useMemo(() => eachDay(from, to < today ? to : today), [from, to, today]);

  const recordByDay = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>();
    for (const rec of attendance.data ?? []) {
      const key = dayKey(rec.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, new Map());
      map.get(key)!.set(rec.employeeId, rec);
    }
    return map;
  }, [attendance.data]);

  const leaveByDay = useMemo(() => {
    const approved = (leaveRequests.data ?? []).filter((r) => r.status === "approved");
    const map = new Map<string, Set<string>>();
    for (const day of days) {
      const set = new Set<string>();
      for (const r of approved) if (leaveCovers(r, day)) set.add(r.employeeId);
      map.set(day, set);
    }
    return map;
  }, [leaveRequests.data, days]);

  const statusFor = (employeeId: string, day: string) =>
    statusOf(recordByDay.get(day)?.get(employeeId), leaveByDay.get(day)?.has(employeeId) ?? false);

  const trend: TrendDay[] = useMemo(
    () =>
      days.map((day) => {
        const bucket = { key: day, present: 0, absent: 0, leave: 0, late: 0 };
        for (const e of activeEmployees) {
          const s = statusFor(e.id, day);
          if (s === "Present") bucket.present += 1;
          else if (s === "Late") bucket.late += 1;
          else if (s === "On Leave") bucket.leave += 1;
          else bucket.absent += 1;
        }
        return bucket;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, activeEmployees, recordByDay, leaveByDay],
  );

  const todayCounts = useMemo(() => {
    const counts: Record<DayStatus, number> = { Present: 0, Late: 0, Absent: 0, "On Leave": 0 };
    for (const e of activeEmployees) counts[statusFor(e.id, today)] += 1;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmployees, recordByDay, leaveByDay, today]);

  const totalEmployees = overview.data?.totalEmployees ?? activeEmployees.length;
  const pct = (n: number) => (totalEmployees ? `${((n / totalEmployees) * 100).toFixed(1)}%` : "—");

  const hiresLast30 = useMemo(() => {
    const cutoff = addDays(today, -30);
    return activeEmployees.filter((e) => {
      const joined = dayKey(e.joiningDate);
      return joined !== null && joined >= cutoff;
    }).length;
  }, [activeEmployees, today]);

  const departmentRows = useMemo(() => {
    const map = new Map<string, { total: number; presentDays: number }>();
    const deptOf = (e: Employee) => e.departmentName ?? e.department?.name ?? "Unassigned";
    for (const e of activeEmployees) {
      const name = deptOf(e);
      if (!map.has(name)) map.set(name, { total: 0, presentDays: 0 });
      map.get(name)!.total += 1;
    }
    for (const day of days) {
      for (const e of activeEmployees) {
        const s = statusFor(e.id, day);
        if (s === "Present" || s === "Late") map.get(deptOf(e))!.presentDays += 1;
      }
    }
    return [...map.entries()]
      .map(([name, d]) => ({
        name,
        total: d.total,
        present: d.total && days.length ? Math.round((d.presentDays / (d.total * days.length)) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmployees, days, recordByDay, leaveByDay]);

  const tableRows: TableRow[] = useMemo(
    () =>
      activeEmployees.map((e) => ({
        employee: e,
        record: recordByDay.get(today)?.get(e.id),
        status: statusFor(e.id, today),
        department: e.departmentName ?? e.department?.name ?? "",
        location: e.address ?? "",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEmployees, recordByDay, leaveByDay, today],
  );

  const filteredRows = useMemo(() => applyFilters(tableRows, filters), [tableRows, filters]);

  const departmentOptions = useMemo(
    () => [
      { value: "", label: "All Departments" },
      ...[...new Set(tableRows.map((r) => r.department).filter(Boolean))]
        .sort()
        .map((d) => ({ value: d, label: d })),
    ],
    [tableRows],
  );
  const locationOptions = useMemo(
    () => [
      { value: "", label: "All Locations" },
      ...[...new Set(tableRows.map((r) => r.location).filter(Boolean))]
        .sort()
        .map((l) => ({ value: l, label: l })),
    ],
    [tableRows],
  );

  const isLoading = employees.isLoading || attendance.isLoading || leaveRequests.isLoading;
  const isError = employees.isError || attendance.isError;
  const retry = () => {
    if (employees.isError) employees.refetch();
    if (attendance.isError) attendance.refetch();
  };

  function exportCsv() {
    const header = ["Employee", "Employee ID", "Department", "Location", "Status", "Check In", "Check Out", "Working Hours"];
    const lines = filteredRows.map((row) =>
      [
        employeeName(row.employee),
        row.employee.employeeNumber ?? "—",
        row.department || "—",
        row.location || "—",
        row.status,
        formatTime(row.record?.checkInAt),
        formatTime(row.record?.checkOutAt),
        formatMinutes(workedMinutes(row.record, now)),
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Overall Attendance">
        <FilterDropdown onChange={(v) => setRange(v as RangeId)} options={RANGE_OPTIONS}>
          {`${fmtRangeDay(from)} – ${fmtRangeDay(to)}`}
        </FilterDropdown>
        {range === "custom" && (
          <span className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text"
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text"
            />
          </span>
        )}
        <button
          type="button"
          onClick={exportCsv}
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-4 text-xs font-medium text-text hover:bg-surface-elevated"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </PageHeader>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={<Users size={22} />}
          iconClass="bg-success/10 text-success"
          title="Total Employees"
          value={String(totalEmployees)}
          bottom={hiresLast30 > 0 ? `+${hiresLast30} joined in last 30 days` : "Active employees"}
        />
        <KpiCard
          icon={<CheckCircle2 size={22} />}
          iconClass="bg-success/10 text-success"
          title="Present Today"
          value={String(todayCounts.Present)}
          bottom={pct(todayCounts.Present)}
        />
        <KpiCard
          icon={<UserX size={22} />}
          iconClass="bg-error/10 text-error"
          title="Absent Today"
          value={String(todayCounts.Absent)}
          bottom={pct(todayCounts.Absent)}
        />
        <KpiCard
          icon={<Clock3 size={22} />}
          iconClass="bg-warning/10 text-warning"
          title="Late Today"
          value={String(todayCounts.Late)}
          bottom={pct(todayCounts.Late)}
        />
        <KpiCard
          icon={<Plane size={22} />}
          iconClass="bg-mention/10 text-mention"
          title="On Leave Today"
          value={String(todayCounts["On Leave"])}
          bottom={pct(todayCounts["On Leave"])}
        />
      </section>

      <section className="mt-4 grid gap-3 xl:grid-cols-[1.35fr_.9fr_1fr]">
        <AttendanceTrend days={trend} />
        <AttendanceDistribution total={totalEmployees} counts={todayCounts} />
        <DepartmentAttendance rows={departmentRows} />
      </section>

      <section className="mt-4">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
            <div className="relative w-[210px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search employees..."
                className="h-10 w-full rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary"
              />
            </div>

            <FilterDropdown
              value={filters.department}
              onChange={(v) => setFilters((f) => ({ ...f, department: v }))}
              options={departmentOptions}
            />
            {locationOptions.length > 1 && (
              <FilterDropdown
                value={filters.location}
                onChange={(v) => setFilters((f) => ({ ...f, location: v }))}
                options={locationOptions}
              />
            )}
            <FilterDropdown
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              options={STATUS_OPTIONS}
            />

            <button
              type="button"
              onClick={() => setFilters({ search: "", department: "", location: "", status: "" })}
              className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-xs font-medium text-text-secondary hover:bg-surface-elevated"
            >
              <X size={13} />
              Clear
            </button>

            <div className="ml-auto flex items-center gap-2">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value as RangeId)}
                  className={cn(
                    "hidden h-8 rounded-lg border px-3 text-xs font-medium lg:block",
                    range === option.value
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-text-secondary",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <EmployeeTable
            rows={filteredRows}
            isLoading={isLoading}
            isError={isError}
            onRetry={retry}
            now={now}
          />
        </div>
      </section>
    </div>
  );
}
