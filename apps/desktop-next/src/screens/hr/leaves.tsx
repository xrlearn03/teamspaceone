import { useMemo, useState } from "react";
import { Check, Clock, FileText, Pencil, PlusCircle, Trash2, UserCheck, UserMinus, UserX, X, type LucideIcon } from "lucide-react";
import {
  useAttendanceAll,
  useCreateHoliday,
  useCreateLeaveType,
  useDeleteHoliday,
  useDeleteLeaveType,
  useEmployees,
  useHolidays,
  useLeaveRequests,
  useLeaveTypes,
  useReviewLeaveRequest,
  useUpdateHoliday,
  useUpdateLeaveType,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { Input } from "@teamspace-one/ui/input";
import { ApplyLeaveDialog } from "@/screens/hrms/leave";
import {
  DATE_RANGE_OPTIONS,
  FilterDropdown,
  PageHeader,
  Pagination,
  PrimaryAction,
  TableToolbar,
  withinDateRange,
} from "./common";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "@/screens/hrms/common";
import { cn } from "@/lib/utils";
import type { Holiday, LeaveType } from "@/lib/api";

const PAGE_SIZE = 10;

function PoliciesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const leaveTypes = useLeaveTypes();
  const holidays = useHolidays();
  const createLeaveType = useCreateLeaveType();
  const updateLeaveType = useUpdateLeaveType();
  const deleteLeaveType = useDeleteLeaveType();
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();

  const [activeTab, setActiveTab] = useState<"leave-types" | "holidays">("leave-types");
  const [editingLt, setEditingLt] = useState<string | null>(null);
  const [ltName, setLtName] = useState("");
  const [ltCode, setLtCode] = useState("");
  const [ltQuota, setLtQuota] = useState("");
  const [ltPaid, setLtPaid] = useState(true);
  const [ltActive, setLtActive] = useState(true);
  const [editingH, setEditingH] = useState<string | null>(null);
  const [hName, setHName] = useState("");
  const [hDate, setHDate] = useState("");
  const [hRecurring, setHRecurring] = useState(false);

  const isLtPending = createLeaveType.isPending || updateLeaveType.isPending;
  const isHPending = createHoliday.isPending || updateHoliday.isPending;

  function resetLeaveType() {
    setEditingLt(null);
    setLtName("");
    setLtCode("");
    setLtQuota("");
    setLtPaid(true);
    setLtActive(true);
  }

  function resetHoliday() {
    setEditingH(null);
    setHName("");
    setHDate("");
    setHRecurring(false);
  }

  function startEditLeaveType(lt: LeaveType) {
    setEditingLt(lt.id);
    setLtName(lt.name);
    setLtCode(lt.code ?? "");
    setLtQuota(lt.annualQuota != null ? String(lt.annualQuota) : "");
    setLtPaid(lt.isPaid ?? false);
    setLtActive(lt.isActive !== false);
  }

  function startEditHoliday(h: Holiday) {
    setEditingH(h.id);
    setHName(h.name);
    setHDate(h.date ? new Date(h.date).toISOString().slice(0, 10) : "");
    setHRecurring(h.isRecurring ?? false);
  }

  function submitLeaveType(e: React.FormEvent) {
    e.preventDefault();
    if (!ltName.trim() || !ltCode.trim()) return;
    const body = {
      name: ltName.trim(),
      code: ltCode.trim(),
      annualQuota: ltQuota ? Number(ltQuota) : undefined,
      isPaid: ltPaid,
      isActive: ltActive,
    };
    if (editingLt) {
      updateLeaveType.mutate({ id: editingLt, body }, { onSuccess: resetLeaveType });
    } else {
      createLeaveType.mutate(body, { onSuccess: resetLeaveType });
    }
  }

  function submitHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!hName.trim() || !hDate) return;
    const body = { name: hName.trim(), date: hDate, isRecurring: hRecurring };
    if (editingH) {
      updateHoliday.mutate({ id: editingH, body }, { onSuccess: resetHoliday });
    } else {
      createHoliday.mutate(body, { onSuccess: resetHoliday });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Leave Policies</DialogTitle>
          <DialogDescription>Manage leave types and organisation holidays.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border px-4 pt-2">
          {[
            { id: "leave-types", label: "Leave Types" },
            { id: "holidays", label: "Holidays" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id as "leave-types" | "holidays");
                resetLeaveType();
                resetHoliday();
              }}
              className={cn(
                "px-3 py-2 text-xs font-medium transition",
                activeTab === t.id
                  ? "border-b-2 border-primary text-text"
                  : "text-text-secondary hover:text-text",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-4 pb-4 pt-2">
          {activeTab === "leave-types" ? (
            <div className="space-y-4">
              <form onSubmit={submitLeaveType} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-elevated/50 p-3">
                <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">Name</span>
                  <Input value={ltName} onChange={(e) => setLtName(e.target.value)} placeholder="e.g. Sick Leave" />
                </label>
                <label className="flex min-w-[100px] flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">Code</span>
                  <Input value={ltCode} onChange={(e) => setLtCode(e.target.value)} placeholder="e.g. SL" />
                </label>
                <label className="flex min-w-[80px] flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">Quota</span>
                  <Input type="number" min={0} value={ltQuota} onChange={(e) => setLtQuota(e.target.value)} placeholder="Days" />
                </label>
                <label className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={ltPaid}
                    onChange={(e) => setLtPaid(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-xs text-text-secondary">Paid</span>
                </label>
                <label className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={ltActive}
                    onChange={(e) => setLtActive(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-xs text-text-secondary">Active</span>
                </label>
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" disabled={!ltName.trim() || !ltCode.trim() || isLtPending}>
                    {editingLt ? "Update" : "Add"}
                  </Button>
                  {editingLt && (
                    <Button type="button" size="sm" variant="ghost" onClick={resetLeaveType}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>

              {leaveTypes.isLoading ? (
                <SectionSkeleton rows={3} />
              ) : leaveTypes.isError ? (
                <SectionError onRetry={() => leaveTypes.refetch()} />
              ) : (leaveTypes.data ?? []).length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">No leave types configured.</p>
              ) : (
                <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-elevated text-text-secondary">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Quota</th>
                        <th className="px-3 py-2">Paid</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(leaveTypes.data ?? []).map((lt: LeaveType) => (
                        <tr key={lt.id} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-text">{lt.name}</td>
                          <td className="px-3 py-2 text-text-secondary">{lt.code ?? "—"}</td>
                          <td className="px-3 py-2 text-text-secondary">{lt.annualQuota ?? "—"}</td>
                          <td className="px-3 py-2 text-text-secondary">{lt.isPaid ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={lt.isActive !== false ? "active" : "inactive"} />
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => startEditLeaveType(lt)}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-info/10 text-info"
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteLeaveType.mutate(lt.id)}
                                disabled={deleteLeaveType.isPending}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-error/10 text-error"
                                aria-label="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={submitHoliday} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-elevated/50 p-3">
                <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">Name</span>
                  <Input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. Diwali" />
                </label>
                <label className="flex min-w-[120px] flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">Date</span>
                  <Input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={hRecurring}
                    onChange={(e) => setHRecurring(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-xs text-text-secondary">Recurring</span>
                </label>
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" disabled={!hName.trim() || !hDate || isHPending}>
                    {editingH ? "Update" : "Add"}
                  </Button>
                  {editingH && (
                    <Button type="button" size="sm" variant="ghost" onClick={resetHoliday}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>

              {holidays.isLoading ? (
                <SectionSkeleton rows={3} />
              ) : holidays.isError ? (
                <SectionError onRetry={() => holidays.refetch()} />
              ) : (holidays.data ?? []).length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">No holidays configured.</p>
              ) : (
                <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-elevated text-text-secondary">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Recurring</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(holidays.data ?? []).map((h: Holiday) => (
                        <tr key={h.id} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-text">{h.name}</td>
                          <td className="px-3 py-2 text-text-secondary">{formatDate(h.date)}</td>
                          <td className="px-3 py-2 text-text-secondary">{h.isRecurring ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => startEditHoliday(h)}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-info/10 text-info"
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteHoliday.mutate(h.id)}
                                disabled={deleteHoliday.isPending}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-error/10 text-error"
                                aria-label="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
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
  const [policiesOpen, setPoliciesOpen] = useState(false);

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
        <div className="flex items-center gap-2">
          {can("hrms.leave.manage") && (
            <Button variant="secondary" size="sm" onClick={() => setPoliciesOpen(true)}>
              <FileText className="mr-1.5 h-4 w-4" /> Manage Policies
            </Button>
          )}
          {can("hrms.leave.apply") && (
            <PrimaryAction icon={PlusCircle} label="Add New Leave" onClick={() => setApplyOpen(true)} />
          )}
        </div>
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
      <PoliciesDialog open={policiesOpen} onOpenChange={setPoliciesOpen} />
    </div>
  );
}
