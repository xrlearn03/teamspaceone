import { CalendarCheck, CalendarClock, Clock, Users } from "lucide-react";
import { useHrmsOverview, useLeaveRequests, useAttendanceCorrections } from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "./common";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardHeader className="mb-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-text-muted" />
          <CardTitle className="text-xs font-medium text-text-secondary">{label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-text">{value}</p>
      </CardContent>
    </Card>
  );
}

export function HrmsOverviewSection() {
  const { can } = usePermissions();
  const overview = useHrmsOverview();
  const pendingLeaves = useLeaveRequests({ status: "pending" });
  const pendingCorrections = useAttendanceCorrections("pending");

  if (overview.isLoading) return <SectionSkeleton />;
  if (overview.isError || !overview.data) {
    return (
      <SectionError
        message={overview.error instanceof Error ? overview.error.message : undefined}
        onRetry={() => overview.refetch()}
      />
    );
  }

  const o = overview.data;
  return (
    <div className="flex flex-col gap-3 sm:p-4 lg:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total employees" value={o.totalEmployees} />
        <StatCard icon={CalendarCheck} label="Present today" value={o.presentToday} />
        <StatCard icon={CalendarClock} label="Pending leave approvals" value={o.pendingLeaveRequests} />
        <StatCard icon={Clock} label="Pending corrections" value={o.pendingCorrections} />
      </div>

      {o.byDepartment.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Headcount by department</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5">
              {o.byDepartment.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-sm">
                  <span className="text-text">{d.name}</span>
                  <span className="text-text-muted">{d.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {can("hrms.leave.approve") ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending leave requests</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingLeaves.isLoading ? (
                <SectionSkeleton rows={3} />
              ) : (pendingLeaves.data ?? []).length === 0 ? (
                <p className="text-xs text-text-muted">No pending leave requests.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {(pendingLeaves.data ?? []).slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-text">
                        {r.employeeName ?? r.employeeId} · {r.leaveTypeName ?? "Leave"}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-text-muted">
                        {formatDate(r.startDate)} – {formatDate(r.endDate)}
                        <StatusBadge status={r.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {can("hrms.attendance.approve") ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending attendance corrections</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingCorrections.isLoading ? (
                <SectionSkeleton rows={3} />
              ) : (pendingCorrections.data ?? []).length === 0 ? (
                <p className="text-xs text-text-muted">No pending corrections.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {(pendingCorrections.data ?? []).slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-text">
                        {c.employeeName ?? c.employeeId}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-text-muted">
                        {formatDate(c.date)}
                        <StatusBadge status={c.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
