import { useMemo, useState } from "react";
import { Check, Clock, PlusCircle, UserCheck, UserMinus, UserX, X } from "lucide-react";
import {
  useAttendanceAll,
  useEmployees,
  useLeaveRequests,
  useReviewLeaveRequest,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { ApplyLeaveDialog } from "../hrms/leave";
import {
  DATE_RANGE_OPTIONS,
  FilterDropdown,
  PageHeader,
  Pagination,
  PrimaryAction,
  TableToolbar,
  withinDateRange,
} from "./common";
import { SectionError, SectionSkeleton, formatDate } from "../hrms/common";
import { cn } from "../../lib/utils";

const PAGE_SIZE = 10;

function StatCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface">
      <div className={cn("flex h-full min-h-[72px] w-16 items-center justify-center", className)}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="pr-4">
        <div className="text-xs font-medium text-text-secondary">{label}</div>
        <div className="text-lg font-semibold text-text">{value}</div>
      </div>
    </div>
  );
}

export function HrLeavesScreen() {
  const { can } = usePermissions();
  const today = new Date().toISOString().slice(0, 10);
  const requests = useLeaveRequests();
  const employees = useEmployees();
  const attendance = useAttendanceAll({ from: today, to: today });
  const review = useReviewLeaveRequest();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [leaveType, setLeaveType] = useState("");
  const [range, setRange] = useState("all");
  const [applyOpen, setApplyOpen] = useState(false);

  const all = requests.data ?? [];
  const deptByEmployeeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees.data ?? []) {
      const dept = e.departmentName ?? e.department?.name;
      if (dept) map.set(e.id, dept);
    }
    return map;
  }, [employees.data]);

  const stats = useMemo(() => {
    const approved = all.filter((r) => r.status === "approved");
    return {
      present: `${attendance.data?.length ?? 0}/${employees.data?.length ?? 0}`,
      planned: approved.filter((r) => r.startDate > today).length,
      unplanned: approved.filter((r) => r.startDate <= today).length,
      pending: all.filter((r) => r.status === "pending").length,
    };
  }, [all, attendance.data, employees.data, today]);

  const leaveTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of all) map.set(r.leaveTypeId, r.leaveTypeName ?? "Leave");
    return [
      { value: "", label: "All types" },
      ...[...map.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [all]);

  const filtered = all.filter((r) => {
    if (leaveType && r.leaveTypeId !== leaveType) return false;
    if (!withinDateRange(r.startDate, range)) return false;
    if (query) {
      const q = query.toLowerCase();
      return (
        (r.employeeName ?? "").toLowerCase().includes(q) ||
        (r.leaveTypeName ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });
  const rows = filtered.slice((page - 1) * perPage, page * perPage);
  const canApprove = can("hrms.leave.approve");

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Leaves">
        {can("hrms.leave.apply") && (
          <PrimaryAction icon={PlusCircle} label="Add New Leave" onClick={() => setApplyOpen(true)} />
        )}
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserCheck} label="Total Present" value={stats.present} className="bg-success" />
        <StatCard icon={UserMinus} label="Planned Leaves" value={String(stats.planned)} className="bg-mention" />
        <StatCard icon={Clock} label="Unplanned Leaves" value={String(stats.unplanned)} className="bg-warning" />
        <StatCard icon={UserX} label="Pending Requests" value={String(stats.pending)} className="bg-info" />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Leave List</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={leaveType}
              onChange={(v) => { setLeaveType(v); setPage(1); }}
              options={leaveTypeOptions}
            >
              Leave Type
            </FilterDropdown>
            <FilterDropdown
              label="Sort By : "
              value={range}
              onChange={(v) => { setRange(v); setPage(1); }}
              options={DATE_RANGE_OPTIONS}
            />
          </div>
        </div>

        <TableToolbar
          query={query}
          onQuery={(q) => { setQuery(q); setPage(1); }}
          perPage={perPage}
          onPerPage={(n) => { setPerPage(n); setPage(1); }}
        />

        {requests.isLoading ? (
          <div className="p-5">
            <SectionSkeleton rows={5} />
          </div>
        ) : requests.isError ? (
          <SectionError onRetry={() => requests.refetch()} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="bg-surface-elevated">
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox" className="h-4 w-4 rounded border-border" />
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-text">Employee</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Leave Type</th>
                    <th className="px-4 py-2.5 font-semibold text-text">From</th>
                    <th className="px-4 py-2.5 font-semibold text-text">To</th>
                    <th className="px-4 py-2.5 font-semibold text-text">No of Days</th>
                    <th className="w-28 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <input type="checkbox" className="h-4 w-4 rounded border-border" />
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-[10px]">
                              {(r.employeeName ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            <span className="block font-medium text-text">{r.employeeName ?? r.employeeId}</span>
                            <span className="block text-xs text-text-muted">
                              {deptByEmployeeId.get(r.employeeId) ?? "—"}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{r.leaveTypeName ?? "Leave"}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(r.startDate)}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(r.endDate)}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {r.days ?? "—"} {r.days === 1 ? "Day" : "Days"}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "pending" && canApprove ? (
                          <span className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => review.mutate({ id: r.id, action: "approve" })}
                              disabled={review.isPending}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success"
                              aria-label="Approve"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => review.mutate({ id: r.id, action: "reject" })}
                              disabled={review.isPending}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-error/10 text-error"
                              aria-label="Reject"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "flex w-fit items-center justify-end gap-1.5 rounded px-2 py-0.5 text-xs font-medium capitalize",
                              r.status === "approved"
                                ? "bg-success/10 text-success"
                                : r.status === "rejected" || r.status === "cancelled"
                                  ? "bg-error/10 text-error"
                                  : "bg-warning/10 text-warning",
                            )}
                          >
                            {r.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                        {query ? "No leave requests match your search." : "No leave requests yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={perPage} onPage={setPage} />
          </>
        )}
      </div>

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
