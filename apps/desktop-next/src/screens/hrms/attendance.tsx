import { useMemo, useState } from "react";
import { CalendarCheck, Check, Clock, LogIn, LogOut, ShieldAlert, X } from "lucide-react";
import {
  useAttendance,
  useAttendanceCheckin,
  useAttendanceCheckout,
  useAttendanceCorrections,
  useAttendancePresence,
  useMyEmployee,
  useRequestAttendanceCorrection,
  useReviewAttendanceCorrection,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@teamspace-one/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import type { AttendanceRecord } from "@/lib/api";
import { SectionError, SectionSkeleton, StatusBadge, formatDate, formatMinutes, formatTime } from "./common";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
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

export function AttendanceSection() {
  const { can } = usePermissions();
  const me = useMyEmployee();
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(todayStr());
  const params = useMemo(
    () => ({ employeeId: me.data?.id, from, to }),
    [me.data?.id, from, to],
  );
  const attendance = useAttendance(params);
  const checkin = useAttendanceCheckin();
  const checkout = useAttendanceCheckout();
  const presence = useAttendancePresence();
  const corrections = useAttendanceCorrections("pending");
  const review = useReviewAttendanceCorrection();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

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
  const todayRecord = attendance.data?.find((r) => r.date.slice(0, 10) === today);
  const canCheckin = can("hrms.attendance.checkin");
  const canCheckout = can("hrms.attendance.checkout");
  const canApprove = can("hrms.attendance.approve");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">
                  {todayRecord?.checkInAt ? "Checked in" : "Not checked in"}
                </p>
                <p className="text-xs text-text-muted">
                  {todayRecord?.checkInAt ? formatTime(todayRecord.checkInAt) : "—"}
                  {todayRecord?.checkOutAt ? ` → ${formatTime(todayRecord.checkOutAt)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!canCheckin || checkin.isPending || Boolean(todayRecord?.checkInAt)}
                onClick={() => checkin.mutate()}
              >
                <LogIn className="mr-1 h-4 w-4" /> Check in
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canCheckout || checkout.isPending || !todayRecord?.checkInAt || Boolean(todayRecord?.checkOutAt)}
                onClick={() => checkout.mutate()}
              >
                <LogOut className="mr-1 h-4 w-4" /> Check out
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canCheckin || presence.isPending || !todayRecord?.checkInAt || Boolean(todayRecord?.checkOutAt)}
                onClick={() => presence.mutate("lunch")}
              >
                Lunch
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canCheckin || presence.isPending || !todayRecord?.checkInAt || Boolean(todayRecord?.checkOutAt)}
                onClick={() => presence.mutate("tea_break")}
              >
                Tea break
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canCheckin || presence.isPending || !todayRecord?.checkInAt || Boolean(todayRecord?.checkOutAt)}
                onClick={() => presence.mutate("out_of_office")}
              >
                OOO
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Attendance history</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-36"
              />
              <span className="text-text-muted">→</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-36"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(attendance.data ?? []).length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No attendance records"
              description="Records appear once you start checking in."
            />
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Check-in</th>
                  <th className="px-4 py-2 font-medium">Check-out</th>
                  <th className="px-4 py-2 font-medium">Worked</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(attendance.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-text">{formatDate(r.date)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{formatTime(r.checkInAt)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{formatTime(r.checkOutAt)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{formatMinutes(r.workedMinutes)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5 text-right">
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
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      {canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending corrections</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {corrections.isLoading ? (
              <p className="p-4 text-xs text-text-muted">Loading…</p>
            ) : corrections.isError ? (
              <SectionError onRetry={() => corrections.refetch()} />
            ) : (corrections.data ?? []).length === 0 ? (
              <p className="p-4 text-xs text-text-muted">Nothing awaiting approval.</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-text-muted">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Requested</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {(corrections.data ?? []).map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-text">{c.employeeName ?? c.employeeId}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{formatDate(c.date)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {formatTime(c.requestedCheckInAt)} – {formatTime(c.requestedCheckOutAt)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{c.reason ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Approve"
                            disabled={review.isPending}
                            onClick={() => {
                              const note = window.prompt("Approval note (optional)") ?? undefined;
                              review.mutate({ id: c.id, action: "approve", note });
                            }}
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
                              review.mutate({ id: c.id, action: "reject", note });
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

      <RequestCorrectionDialog
        record={selectedRecord}
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
      />
    </div>
  );
}
