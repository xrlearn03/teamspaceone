import { Calendar, TrendingUp } from "lucide-react";
import {
  useAttendanceAll,
  useCandidates,
  useEmployees,
  useProjects,
} from "../../hooks/api";
import { useUIStore } from "../../stores/ui";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { SectionError, SectionSkeleton, formatDate, formatTime } from "../hrms/common";
import { cn } from "../../lib/utils";
import type { Employee } from "../../lib/api";

const TYPE_META: Record<string, { label: string; bar: string; dot: string }> = {
  full_time: { label: "Fulltime", bar: "bg-warning", dot: "bg-warning" },
  contract: { label: "Contract", bar: "bg-info", dot: "bg-info" },
  probation: { label: "Probation", bar: "bg-error", dot: "bg-error" },
  wfh: { label: "WFH", bar: "bg-mention", dot: "bg-mention" },
  intern: { label: "WFH", bar: "bg-mention", dot: "bg-mention" },
};

function Card({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col rounded-lg border border-border bg-surface", className)}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {action}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </div>
  );
}

function initials(name?: string | null) {
  return (name ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function employeeName(e: Employee) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function employeeRole(e: Employee) {
  return e.designationName ?? e.designation?.title ?? e.designation?.name ?? e.departmentName ?? "—";
}

export function HrDashboardScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const employees = useEmployees();
  const today = new Date().toISOString().slice(0, 10);
  const attendance = useAttendanceAll({ from: today, to: today });
  const projects = useProjects();
  const candidates = useCandidates();

  const empList = employees.data ?? [];
  const byType = new Map<string, number>();
  for (const e of empList) {
    const key = (e.employmentType || "full_time").toLowerCase();
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  const typeEntries = [...byType.entries()];

  const todayAttendance = attendance.data ?? [];
  const late = todayAttendance.filter((a) => (a.status ?? "").toLowerCase() === "late");

  return (
    <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 xl:grid-cols-3">
      {/* Employee Status */}
      <Card
        title="Employee Status"
        action={
          <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-text">
            <Calendar className="h-3.5 w-3.5" /> This Week
          </span>
        }
      >
        {employees.isLoading ? (
          <SectionSkeleton rows={3} />
        ) : employees.isError ? (
          <SectionError onRetry={() => employees.refetch()} />
        ) : (
          <>
            <div className="flex items-end justify-between">
              <span className="text-sm text-text-secondary">Total Employee</span>
              <span className="text-2xl font-semibold text-text">{empList.length}</span>
            </div>
            <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded">
              {typeEntries.map(([type, count]) => (
                <div
                  key={type}
                  className={cn("h-full", TYPE_META[type]?.bar ?? "bg-text-muted")}
                  style={{ width: `${(count / Math.max(1, empList.length)) * 100}%` }}
                  title={`${TYPE_META[type]?.label ?? type}: ${count}`}
                />
              ))}
              {typeEntries.length === 0 && <div className="h-full w-full bg-surface-elevated" />}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {typeEntries.slice(0, 4).map(([type, count]) => (
                <div key={type} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span className={cn("h-2 w-2 rounded-sm", TYPE_META[type]?.dot ?? "bg-text-muted")} />
                    {TYPE_META[type]?.label ?? type} ({Math.round((count / Math.max(1, empList.length)) * 100)}%)
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-text">{count}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setActiveView("employees")}
              className="mt-4 w-full rounded-md bg-surface-elevated py-2 text-center text-xs font-medium text-text"
            >
              View All Employees
            </button>
          </>
        )}
      </Card>

      {/* Clock-In/Out */}
      <Card title="Clock-In/Out" action={
        <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-text">
          <Calendar className="h-3.5 w-3.5" /> Today
        </span>
      }>
        {attendance.isLoading ? (
          <SectionSkeleton rows={3} />
        ) : attendance.isError ? (
          <SectionError onRetry={() => attendance.refetch()} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {todayAttendance.slice(0, 3).map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px]">{initials(a.employeeName)}</AvatarFallback>
                    </Avatar>
                    <span>
                      <span className="block text-sm font-medium text-text">{a.employeeName ?? "—"}</span>
                      <span className="block text-xs text-text-muted">{a.presenceStatus ?? a.status}</span>
                    </span>
                  </span>
                  <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    {formatTime(a.checkInAt)}
                  </span>
                </li>
              ))}
              {todayAttendance.length === 0 && (
                <li className="py-4 text-center text-xs text-text-muted">No check-ins recorded today.</li>
              )}
            </ul>
            {late.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-text-secondary">Late</div>
                <ul className="mt-2 flex flex-col gap-2">
                  {late.slice(0, 2).map((a) => (
                    <li key={a.id} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-text">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[9px]">{initials(a.employeeName)}</AvatarFallback>
                        </Avatar>
                        {a.employeeName}
                      </span>
                      <span className="rounded bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                        {formatTime(a.checkInAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={() => setActiveView("hrms", { hrmsTab: "attendance" })}
              className="mt-4 w-full rounded-md bg-surface-elevated py-2 text-center text-xs font-medium text-text"
            >
              View All Attendance
            </button>
          </>
        )}
      </Card>

      {/* Projects */}
      <Card title="Projects" action={
        <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-text">
          <Calendar className="h-3.5 w-3.5" /> This Month
        </span>
      }>
        {projects.isLoading ? (
          <SectionSkeleton rows={3} />
        ) : projects.isError ? (
          <SectionError onRetry={() => projects.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px] text-left text-xs">
              <thead>
                <tr className="bg-surface-elevated text-text-secondary">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Team</th>
                  <th className="px-3 py-2 font-medium">Deadline</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(projects.data ?? []).slice(0, 6).map((p, i) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2.5 text-text-secondary">PRO-{String(i + 1).padStart(3, "0")}</td>
                    <td className="px-3 py-2.5 font-medium text-text">{p.name}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex -space-x-1.5">
                        {p.members.slice(0, 3).map((m) => (
                          <Avatar key={m.userId} className="h-5 w-5 border border-surface">
                            <AvatarFallback className="text-[8px]">{m.userId.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        ))}
                        {p.members.length > 3 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-surface bg-primary text-[8px] font-medium text-white">
                            +{p.members.length - 3}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary">{formatDate(p.targetDate)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        p.status === "active" ? "bg-success/10 text-success" : "bg-surface-elevated text-text-secondary",
                      )}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {(projects.data ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-text-muted">No projects yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Jobs Applicants */}
      <Card title="Jobs Applicants" action={
        <button type="button" onClick={() => setActiveView("interview")} className="rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text">
          View All
        </button>
      }>
        {candidates.isLoading ? (
          <SectionSkeleton rows={3} />
        ) : candidates.isError ? (
          <SectionError onRetry={() => candidates.refetch()} />
        ) : (
          <ul className="flex flex-col gap-3">
            {(candidates.data ?? []).slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-[10px]">{initials(c.name)}</AvatarFallback>
                  </Avatar>
                  <span>
                    <span className="block text-sm font-medium text-text">{c.name}</span>
                    <span className="block text-xs text-text-muted">
                      {c.location ?? "—"}{c.applications?.[0]?.jobOpening?.title ? ` · ${c.applications[0].jobOpening.title}` : ""}
                    </span>
                  </span>
                </span>
                {c.applications?.[0]?.jobOpening?.title ? (
                  <span className="rounded bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                    {c.applications[0].jobOpening.title}
                  </span>
                ) : null}
              </li>
            ))}
            {(candidates.data ?? []).length === 0 && (
              <li className="py-4 text-center text-xs text-text-muted">No applicants yet.</li>
            )}
          </ul>
        )}
      </Card>

      {/* Employees */}
      <Card title="Employees" action={
        <button type="button" onClick={() => setActiveView("employees")} className="rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text">
          View All
        </button>
      }>
        {employees.isLoading ? (
          <SectionSkeleton rows={3} />
        ) : (
          <>
            <div className="flex bg-surface-elevated px-3 py-2 text-xs font-medium text-text-secondary">
              <span className="flex-1">Name</span>
              <span>Department</span>
            </div>
            <ul className="flex flex-col">
              {empList.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
                  <button
                    type="button"
                    onClick={() => setActiveView("employee-detail", { employeeId: e.id })}
                    className="flex items-center gap-2.5 text-left"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px]">{initials(employeeName(e))}</AvatarFallback>
                    </Avatar>
                    <span>
                      <span className="block text-sm font-medium text-text">{employeeName(e)}</span>
                      <span className="block text-xs text-text-muted">{employeeRole(e)}</span>
                    </span>
                  </button>
                  <span className="rounded bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary">
                    {e.departmentName ?? e.department?.name ?? "—"}
                  </span>
                </li>
              ))}
              {empList.length === 0 && (
                <li className="py-4 text-center text-xs text-text-muted">No employees yet.</li>
              )}
            </ul>
          </>
        )}
      </Card>

      {/* Todo — no personal-todos API exists yet */}
      <Card title="Todo" action={
        <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-text">
          <Calendar className="h-3.5 w-3.5" /> Today
        </span>
      }>
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <TrendingUp className="h-5 w-5 text-text-muted" />
          <p className="text-xs text-text-muted">Personal todos aren&apos;t connected to a backend yet.</p>
        </div>
      </Card>
    </div>
  );
}
