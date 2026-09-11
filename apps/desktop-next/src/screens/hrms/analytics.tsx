import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useHrmsAnalytics } from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { SectionError, SectionSkeleton, StatusBadge, formatMinutes } from "./common";

function money(value?: number | null) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  } catch {
    return String(value);
  }
}

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

function BarRow({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-40 truncate text-text">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs text-text-muted">
        {value}
        {suffix ?? ""}
      </span>
    </li>
  );
}

export function AnalyticsSection() {
  const { can } = usePermissions();
  const analytics = useHrmsAnalytics();

  if (!can("hrms.analytics.view")) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to HR analytics"
          description="Analytics requires the hrms.analytics.view permission."
        />
      </Card>
    );
  }

  if (analytics.isLoading) return <SectionSkeleton />;
  if (analytics.isError || !analytics.data) {
    return (
      <SectionError
        message={analytics.error instanceof Error ? analytics.error.message : undefined}
        onRetry={() => analytics.refetch()}
      />
    );
  }

  const a = analytics.data;
  const maxDept = Math.max(1, ...a.byDepartment.map((d) => d.count));
  const maxLeave = Math.max(1, ...a.leave.usageByType.map((l) => l.entitled || l.used));

  return (
    <div className="flex flex-col gap-3 sm:p-4 lg:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Headcount" value={a.headcount} />
        <StatCard icon={UserPlus} label="Recent hires" value={a.recentHires} />
        <StatCard icon={TrendingDown} label="Terminations" value={a.terminations} />
        <StatCard icon={CalendarClock} label="Pending leave requests" value={a.leave.pendingRequests} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserPlus} label="Active onboarding" value={a.lifecycle.activeOnboarding} />
        <StatCard icon={UserMinus} label="Active offboarding" value={a.lifecycle.activeOffboarding} />
        <StatCard icon={TrendingUp} label="Upcoming reviews" value={a.lifecycle.upcomingReviews} />
        <StatCard icon={Target} label="Goals at risk" value={`${a.goals.atRisk} / ${a.goals.onTrack + a.goals.atRisk}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Headcount by department</CardTitle></CardHeader>
          <CardContent>
            {a.byDepartment.length === 0 ? (
              <p className="text-xs text-text-muted">No department data.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {a.byDepartment.map((d) => (
                  <BarRow key={d.id} label={d.name} value={d.count} max={maxDept} />
                ))}
              </ul>
            )}
            {Object.keys(a.byStatus).length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                {Object.entries(a.byStatus).map(([status, count]) => (
                  <span key={status} className="flex items-center gap-1.5 text-xs text-text-muted">
                    <StatusBadge status={status} /> {count}
                  </span>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Leave usage by type</CardTitle></CardHeader>
          <CardContent>
            {a.leave.usageByType.length === 0 ? (
              <p className="text-xs text-text-muted">No leave usage data.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {a.leave.usageByType.map((l) => (
                  <BarRow key={l.name} label={l.name} value={l.used} max={maxLeave} suffix={` / ${l.entitled}`} />
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-text-muted">
              {a.leave.approvedThisMonth} approved this month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Attendance</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <p className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-text-secondary">
                <CalendarCheck className="h-4 w-4 text-text-muted" /> Present today
              </span>
              <span className="text-text">{a.attendance.presentToday}</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-text-secondary">Avg work time (30d)</span>
              <span className="text-text">{formatMinutes(a.attendance.avgWorkMinutes30d)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-text-secondary">Pending corrections</span>
              <span className="text-text">{a.attendance.pendingCorrections}</span>
            </p>
          </CardContent>
        </Card>

        {a.payroll ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-text-muted" />
                <CardTitle>Payroll</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-text-secondary">Last period status</span>
                <StatusBadge status={a.payroll.lastPeriodStatus} />
              </p>
              <p className="flex items-center justify-between">
                <span className="text-text-secondary">Total net (last period)</span>
                <span className="text-text">{money(a.payroll.totalNetLastPeriod)}</span>
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-text-muted" />
                <CardTitle>Pending onboarding</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-text">{a.lifecycle.pendingOnboarding}</p>
              <p className="text-xs text-text-muted">Awaiting conversion or start.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
