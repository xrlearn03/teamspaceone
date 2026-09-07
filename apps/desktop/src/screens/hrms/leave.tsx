import { useState } from "react";
import { CalendarClock, Check, Plus, X } from "lucide-react";
import {
  useApplyLeave,
  useHrmsCalendar,
  useLeaveBalances,
  useLeaveRequests,
  useLeaveTypes,
  useMyEmployee,
  useReviewLeaveRequest,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { Input } from "../../components/ui/input";
import {
  SectionError,
  SectionSkeleton,
  StatusBadge,
  formatDate,
} from "./common";

function ApplyLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const types = useLeaveTypes();
  const apply = useApplyLeave();
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  function submit() {
    if (!leaveTypeId || !startDate || !endDate) return;
    apply.mutate(
      { leaveTypeId, startDate, endDate, reason: reason || undefined },
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
          <div className="grid grid-cols-2 gap-3">
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
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={apply.isPending || !leaveTypeId || !startDate || !endDate}>
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveSection() {
  const { can } = usePermissions();
  const me = useMyEmployee();
  const canApprove = can("hrms.leave.approve");
  const balances = useLeaveBalances(me.data?.id);
  const myRequests = useLeaveRequests({ mine: true });
  const approvalQueue = useLeaveRequests(canApprove ? { status: "pending" } : undefined);
  const today = new Date();
  const rangeEnd = new Date(today);
  rangeEnd.setMonth(rangeEnd.getMonth() + 3);
  const calendar = useHrmsCalendar({
    from: today.toISOString().slice(0, 10),
    to: rangeEnd.toISOString().slice(0, 10),
  });
  const review = useReviewLeaveRequest();
  const [applyOpen, setApplyOpen] = useState(false);

  if (me.isLoading || balances.isLoading || myRequests.isLoading) return <SectionSkeleton />;
  if (me.isError) return <SectionError onRetry={() => me.refetch()} message={me.error?.message} />;
  if (!me.data) return <EmptyState icon={CalendarClock} title="No employee record" description="Leave management is only available for employees." />;
  if (balances.isError) return <SectionError onRetry={() => balances.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Balances</h2>
        {can("hrms.leave.apply") ? (
          <Button size="sm" onClick={() => setApplyOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Apply for leave
          </Button>
        ) : null}
      </div>

      {(balances.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={CalendarClock} title="No leave balances" description="Balances appear once leave types are assigned to you." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(balances.data ?? []).map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle>{b.leaveTypeName ?? "Leave"}</CardTitle>
                {b.year ? <span className="text-xs text-text-muted">{b.year}</span> : null}
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-text">{b.remaining}</p>
                <p className="text-xs text-text-muted">
                  {b.used} used · {b.entitled} entitled
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>My requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(myRequests.data ?? []).length === 0 ? (
            <p className="p-4 text-xs text-text-muted">No leave requests yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Dates</th>
                  <th className="px-4 py-2 font-medium">Days</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(myRequests.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-text">{r.leaveTypeName ?? "Leave"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{r.days ?? "—"}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {r.status === "pending" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ id: r.id, action: "cancel" })}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {canApprove ? (
        <Card>
          <CardHeader><CardTitle>Approval queue</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(approvalQueue.data ?? []).length === 0 ? (
              <p className="p-4 text-xs text-text-muted">Nothing awaiting approval.</p>
            ) : (
              <table className="w-full text-sm">
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
                  {(approvalQueue.data ?? []).map((r) => (
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
                            disabled={review.isPending}
                            onClick={() => review.mutate({ id: r.id, action: "approve" })}
                          >
                            <Check className="h-4 w-4 text-success" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Reject"
                            disabled={review.isPending}
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
              </table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Team calendar</CardTitle></CardHeader>
        <CardContent>
          {calendar.isLoading ? (
            <p className="text-xs text-text-muted">Loading…</p>
          ) : (
            (() => {
              const items = [
                ...(calendar.data?.holidays ?? []).map((e) => ({ ...e, kind: "holiday" as const })),
                ...(calendar.data?.events ?? []).map((e) => ({ ...e, kind: e.type })),
              ].sort((a, b) => a.startAt.localeCompare(b.startAt));
              return items.length === 0 ? (
                <p className="text-xs text-text-muted">No upcoming leave or holidays.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {items.slice(0, 12).map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-text">
                        <StatusBadge status={e.kind} />
                        {e.title}
                      </span>
                      <span className="text-xs text-text-muted">
                        {formatDate(e.startAt)}
                        {e.endAt.slice(0, 10) !== e.startAt.slice(0, 10) ? ` – ${formatDate(e.endAt)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()
          )}
        </CardContent>
      </Card>

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
