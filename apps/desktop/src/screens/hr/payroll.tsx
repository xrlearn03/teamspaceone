import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Play,
  Search,
  ShieldAlert,
  Users,
  Wallet,
  WalletCards,
  X,
} from "lucide-react";
import {
  useApprovePayrollPeriod,
  useCreatePayrollPeriod,
  useDepartments,
  useEmployees,
  useHrmsOverview,
  useMarkPayrollPeriodPaid,
  usePayrollPeriods,
  usePayrollSummary,
  usePayslips,
  useProcessPayrollPeriod,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import { exportPayrollPeriodCsv } from "../../lib/api";
import type { Employee, PayrollPeriod, PayrollSummaryRow, Payslip } from "../../lib/api";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Button } from "@teamspace-one/ui/button";
import { Card } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { cn } from "../../lib/utils";
import { MyPayrollScreen } from "../my-payroll";
import { PageHeader } from "./common";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "../hrms/common";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function money(value?: number | null, currency?: string | null) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
    }).format(value);
  } catch {
    return `${currency ?? ""} ${value}`;
  }
}

function compactMoney(value: number, currency?: string | null) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

function periodLabel(p: PayrollPeriod) {
  return p.name ?? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`;
}

function employeeName(e?: Employee | null) {
  if (!e) return "—";
  return `${e.firstName} ${e.lastName}`.trim() || "—";
}

function employeeDept(e?: Employee | null) {
  return e?.department?.name ?? e?.departmentName ?? "—";
}

function employeeTitle(e?: Employee | null) {
  return e?.designation?.title ?? e?.designation?.name ?? e?.designationName ?? "—";
}

function initials(e?: Employee | null) {
  if (!e) return "?";
  return `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function grossOf(p: Payslip) {
  return p.gross ?? p.grossPay ?? 0;
}

function netOf(p: Payslip) {
  return p.net ?? p.netPay ?? 0;
}

function deductionsTotal(p: Payslip) {
  return Object.values(p.deductions ?? {}).reduce((sum, v) => sum + (v ?? 0), 0);
}

/** Payslip rows only exist as draft → paid; surface friendlier labels. */
function payslipStatusLabel(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "draft") return "pending";
  return s || "unknown";
}

const DONUT_COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#fb923c", "#f43f5e", "#94a3b8"];

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  iconClass,
  title,
  value,
  subtitle,
  trend,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  value: string;
  subtitle: string;
  trend?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconClass)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-muted">{title}</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-2xl font-semibold tracking-tight text-text">{value}</p>
            {trend ? <span className="text-xs font-semibold text-success">{trend}</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline stepper — draft → processing → processed → approved → paid */
/* ------------------------------------------------------------------ */

const STEP_LABELS = ["Data Collection", "Processing", "Review & Approvals", "Disbursement"];

function stepIndex(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "draft":
      return 0;
    case "processing":
      return 1;
    case "processed":
      return 2;
    case "approved":
      return 3;
    case "paid":
      return 4; // all steps complete
    default:
      return -1;
  }
}

function PayrollStepper({ period }: { period?: PayrollPeriod }) {
  const current = stepIndex(period?.status);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Payroll Status</h2>
        <span className="text-xs text-text-muted">{period ? periodLabel(period) : "No period"}</span>
      </div>
      <div className="mt-6 grid grid-cols-4">
        {STEP_LABELS.map((label, i) => {
          const state = current < 0 ? "pending" : i < current ? "done" : i === current ? "active" : current === STEP_LABELS.length ? "done" : "pending";
          const effective = current === STEP_LABELS.length ? "done" : state;
          return (
            <div key={label} className="relative text-center">
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={cn(
                    "absolute left-1/2 top-4 h-0.5 w-full",
                    i < current ? "bg-primary" : "bg-border",
                  )}
                />
              )}
              <div
                className={cn(
                  "relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  effective === "done" || effective === "active"
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-text-muted",
                )}
              >
                {effective === "done" ? <Check size={14} /> : i + 1}
              </div>
              <p className="mt-2 text-xs font-medium text-text-secondary">{label}</p>
              <span
                className={cn(
                  "mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium",
                  effective === "done"
                    ? "bg-success/10 text-success"
                    : effective === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-elevated text-text-muted",
                )}
              >
                {effective === "done" ? "Completed" : effective === "active" ? "In Progress" : "Pending"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Cost trend (from payroll summary)                                   */
/* ------------------------------------------------------------------ */

function CostTrend({ rows, currency }: { rows: PayrollSummaryRow[]; currency?: string | null }) {
  const ordered = useMemo(
    () =>
      [...rows]
        .filter((r) => (r.netTotal ?? 0) > 0 || r.status !== "draft")
        .slice(0, 6)
        .reverse(),
    [rows],
  );
  const max = Math.max(...ordered.map((r) => r.netTotal ?? 0), 1);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Payroll Cost Trend</h2>
        <span className="text-xs text-text-muted">Net pay per period</span>
      </div>
      {ordered.length === 0 ? (
        <div className="flex h-36 items-center justify-center text-xs text-text-muted">
          No processed payroll yet.
        </div>
      ) : (
        <div className="mt-5 flex h-36 items-end justify-around gap-2">
          {ordered.map((r, i) => {
            const last = i === ordered.length - 1;
            const height = Math.max(((r.netTotal ?? 0) / max) * 100, 4);
            return (
              <div key={r.periodId} className="flex h-full w-10 flex-col items-center justify-end" title={money(r.netTotal, currency)}>
                {last && (
                  <span className="mb-1 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-text">
                    {compactMoney(r.netTotal ?? 0, currency)}
                  </span>
                )}
                <div
                  className={cn("w-6 rounded-t", last ? "bg-primary" : "bg-primary/20")}
                  style={{ height: `${height}%` }}
                />
                <span className="mt-1.5 text-[10px] text-text-muted">
                  {(r.name ?? "").slice(0, 6) || `#${i + 1}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Cost by department donut                                            */
/* ------------------------------------------------------------------ */

function DepartmentDonut({
  payslips,
  employeeById,
  currency,
}: {
  payslips: Payslip[];
  employeeById: Map<string, Employee>;
  currency?: string | null;
}) {
  const slices = useMemo(() => {
    const byDept = new Map<string, number>();
    for (const p of payslips) {
      const dept = employeeDept(employeeById.get(p.employeeId));
      byDept.set(dept, (byDept.get(dept) ?? 0) + netOf(p));
    }
    const sorted = [...byDept.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((sum, [, v]) => sum + v, 0);
    if (rest > 0) top.push(["Others", rest]);
    return top.map(([name, value], i) => ({ name, value, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  }, [payslips, employeeById]);

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-text">Cost by Department</h2>
      {total <= 0 ? (
        <div className="flex h-36 items-center justify-center text-xs text-text-muted">
          No payslips in this period.
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <div
            className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(${slices
                .map((s, i) => {
                  const start = slices.slice(0, i).reduce((a, x) => a + (x.value / total) * 100, 0);
                  const end = start + (s.value / total) * 100;
                  return `${s.color} ${start}% ${end}%`;
                })
                .join(", ")})`,
            }}
          >
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-surface">
              <span className="text-sm font-semibold text-text">{compactMoney(total, currency)}</span>
              <span className="text-[10px] text-text-muted">Total</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate text-xs text-text-secondary">{s.name}</span>
                <span className="text-xs font-medium text-text-muted">
                  {Math.round((s.value / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Period row actions (process / approve / mark paid / export)         */
/* ------------------------------------------------------------------ */

function usePeriodExport() {
  const [exporting, setExporting] = useState<string | null>(null);
  const download = async (period: PayrollPeriod) => {
    setExporting(period.id);
    try {
      const blob = await exportPayrollPeriodCsv(period.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-${periodLabel(period).replace(/[^\w-]+/g, "_")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };
  return { exporting, download };
}

function PeriodActions({ period }: { period: PayrollPeriod }) {
  const { can } = usePermissions();
  const canManage = can("hrms.payroll.manage");
  const canProcess = can("hrms.payroll.process") || canManage;
  const canExport = can("hrms.payroll.export");
  const process = useProcessPayrollPeriod();
  const approve = useApprovePayrollPeriod();
  const markPaid = useMarkPayrollPeriodPaid();
  const { exporting, download } = usePeriodExport();
  const status = (period.status ?? "").toLowerCase();
  const busy = process.isPending || approve.isPending || markPaid.isPending || exporting === period.id;

  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {canProcess && status === "draft" ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => process.mutate(period.id)}>
          <Play className="mr-1 h-3.5 w-3.5" /> Process
        </Button>
      ) : null}
      {canManage && status === "processed" ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => approve.mutate(period.id)}>
          <Check className="mr-1 h-3.5 w-3.5" /> Approve
        </Button>
      ) : null}
      {canManage && status === "approved" ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Mark "${periodLabel(period)}" as paid?`)) markPaid.mutate(period.id);
          }}
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Mark paid
        </Button>
      ) : null}
      {canExport && status !== "draft" ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => download(period)}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Run payroll dialog                                                  */
/* ------------------------------------------------------------------ */

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function RunPayrollDialog({
  open,
  onOpenChange,
  periods,
  employeeCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: PayrollPeriod[];
  employeeCount: number;
}) {
  const { can } = usePermissions();
  const canManage = can("hrms.payroll.manage");
  const canProcess = can("hrms.payroll.process") || canManage;
  const createPeriod = useCreatePayrollPeriod();
  const process = useProcessPayrollPeriod();
  const approve = useApprovePayrollPeriod();
  const markPaid = useMarkPayrollPeriodPaid();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);

  const existing = periods.find((p) => (p.startDate ?? "").slice(0, 7) === month);
  const status = (existing?.status ?? "").toLowerCase();
  const busy =
    createPeriod.isPending || process.isPending || approve.isPending || markPaid.isPending;

  async function run() {
    if (!existing) return;
    setError(null);
    try {
      if (status === "draft") await process.mutateAsync(existing.id);
      else if (status === "processed") await approve.mutateAsync(existing.id);
      else if (status === "approved") await markPaid.mutateAsync(existing.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payroll action failed");
    }
  }

  async function createAndRun() {
    setError(null);
    try {
      const { start, end } = monthRange(month);
      const created = await createPeriod.mutateAsync({
        name: monthName(month),
        startDate: start,
        endDate: end,
      });
      if (canProcess) await process.mutateAsync(created.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create payroll period");
    }
  }

  const nextAction =
    status === "draft" ? "Process payroll"
    : status === "processed" ? "Approve payroll"
    : status === "approved" ? "Mark as paid"
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run Payroll</DialogTitle>
          <DialogDescription>Pick a month, then run or continue its payroll period.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated/50 px-3 py-2.5">
            <span className="text-xs text-text-muted">Payroll month</span>
            <div className="flex gap-1.5">
              <select
                value={month.slice(5, 7)}
                onChange={(e) => setMonth(`${month.slice(0, 4)}-${e.target.value}`)}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text outline-none"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>
                    {new Date(Date.UTC(2026, i, 1)).toLocaleDateString(undefined, {
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </option>
                ))}
              </select>
              <select
                value={month.slice(0, 4)}
                onChange={(e) => setMonth(`${e.target.value}-${month.slice(5, 7)}`)}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text outline-none"
              >
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(
                  (y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-surface-elevated/50 p-3">
            <span className="text-xs text-text-muted">Employees</span>
            <span className="text-xs font-semibold text-text">{employeeCount}</span>
          </div>

          {existing ? (
            <div className="flex items-center justify-between rounded-lg bg-surface-elevated/50 p-3">
              <span className="text-xs text-text-muted">Period status</span>
              <StatusBadge status={existing.status} />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-primary/5 p-3">
              <span className="text-xs text-primary">No period for {monthName(month)}</span>
              <span className="text-xs font-medium text-primary">Will be created</span>
            </div>
          )}

          {error ? <p className="text-xs text-error">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {existing && nextAction ? (
              <Button className="flex-1" disabled={busy} onClick={run}>
                {nextAction}
              </Button>
            ) : existing && status === "paid" ? (
              <Button className="flex-1" disabled>
                Already paid
              </Button>
            ) : !existing ? (
              <Button className="flex-1" disabled={busy || !canManage || !month} onClick={createAndRun}>
                <Play className="mr-1 h-3.5 w-3.5" /> Create &amp; run
              </Button>
            ) : null}
          </div>
          {existing && nextAction && status === "draft" && !canProcess ? (
            <p className="text-[11px] text-text-muted">You need the process payroll permission.</p>
          ) : null}
          {existing && (status === "processed" || status === "approved") && !canManage ? (
            <p className="text-[11px] text-text-muted">You need the manage payroll permission.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Payslip drawer                                                      */
/* ------------------------------------------------------------------ */

function PayslipDrawer({
  payslip,
  employee,
  onClose,
}: {
  payslip: Payslip;
  employee?: Employee;
  onClose: () => void;
}) {
  const earnings = Object.entries(payslip.earnings ?? {});
  const deductions = Object.entries(payslip.deductions ?? {});
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="h-full w-full max-w-sm overflow-y-auto border-l border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <p className="text-xs text-text-muted">Payslip</p>
            <h3 className="mt-1 text-lg font-semibold text-text">{employeeName(employee)}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarFallback>{initials(employee)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-text">{employeeName(employee)}</p>
              <p className="text-xs text-text-muted">{employeeTitle(employee)}</p>
              <div className="mt-1">
                <StatusBadge status={payslipStatusLabel(payslip.status)} />
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="rounded-lg bg-surface-elevated/50 p-3">
              <p className="text-xs text-text-muted">Gross pay</p>
              <p className="mt-1 text-lg font-semibold text-text">
                {money(grossOf(payslip), payslip.currency)}
              </p>
            </div>
            <div className="rounded-lg bg-surface-elevated/50 p-3">
              <p className="text-xs text-text-muted">Total deductions</p>
              <p className="mt-1 text-lg font-semibold text-error">
                {money(deductionsTotal(payslip), payslip.currency)}
              </p>
            </div>
            <div className="rounded-lg bg-primary/5 p-3">
              <p className="text-xs text-primary">Net pay</p>
              <p className="mt-1 text-xl font-semibold text-primary">
                {money(netOf(payslip), payslip.currency)}
              </p>
            </div>
          </div>

          {earnings.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-text-secondary">Earnings</p>
              <div className="mt-2 space-y-1.5">
                {earnings.map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="capitalize text-text-muted">{key}</span>
                    <span className="text-text">{money(value, payslip.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {deductions.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-text-secondary">Deductions</p>
              <div className="mt-2 space-y-1.5">
                {deductions.map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="capitalize text-text-muted">{key}</span>
                    <span className="text-text">{money(value, payslip.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main section                                                        */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 8;
type TableTab = "employees" | "approvals" | "periods";

function PayrollOverview() {
  const { can } = usePermissions();
  const canManage = can("hrms.payroll.manage");
  const canProcess = can("hrms.payroll.process") || canManage;
  const canExport = can("hrms.payroll.export");

  const periods = usePayrollPeriods();
  const summary = usePayrollSummary();
  const employees = useEmployees();
  const departments = useDepartments();
  const overview = useHrmsOverview();

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const periodList = periods.data ?? [];
  const selectedPeriod = periodList.find((p) => p.id === selectedPeriodId) ?? periodList[0];
  const payslips = usePayslips(selectedPeriod ? { payrollPeriodId: selectedPeriod.id } : undefined);

  const [tab, setTab] = useState<TableTab>("employees");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [drawerPayslip, setDrawerPayslip] = useState<Payslip | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const { exporting, download } = usePeriodExport();

  const employeeById = useMemo(
    () => new Map((employees.data ?? []).map((e) => [e.id, e])),
    [employees.data],
  );

  const periodPayslips = payslips.data ?? [];
  const currency = periodPayslips.find((p) => p.currency)?.currency;

  const filteredPayslips = periodPayslips.filter((p) => {
    const e = employeeById.get(p.employeeId);
    const name = p.employeeName ?? employeeName(e);
    const matchesSearch =
      !search ||
      name.toLowerCase().includes(search.toLowerCase()) ||
      (e?.employeeNumber ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesDept = deptFilter === "all" || employeeDept(e) === deptFilter;
    return matchesSearch && matchesDept;
  });

  const pageCount = Math.max(1, Math.ceil(filteredPayslips.length / PAGE_SIZE));
  const pageRows = filteredPayslips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeEmployees = (employees.data ?? []).filter(
    (e) => (e.status ?? "").toLowerCase() === "active",
  ).length;
  const selectedSummary = (summary.data ?? []).find((r) => r.periodId === selectedPeriod?.id);
  const prevSummary = (() => {
    const rows = summary.data ?? [];
    const idx = rows.findIndex((r) => r.periodId === selectedPeriod?.id);
    return idx >= 0 ? rows[idx + 1] : undefined;
  })();
  const trendPct =
    selectedSummary?.grossTotal && prevSummary?.grossTotal
      ? Math.round(((selectedSummary.grossTotal - prevSummary.grossTotal) / prevSummary.grossTotal) * 100)
      : null;
  const isProcessed = ["processed", "approved", "paid"].includes(
    (selectedPeriod?.status ?? "").toLowerCase(),
  );
  const processedCount = isProcessed ? periodPayslips.length : 0;
  const pendingCount = Math.max(0, activeEmployees - periodPayslips.length);
  const actionable = periodList.filter((p) =>
    ["draft", "processing", "processed", "approved"].includes((p.status ?? "").toLowerCase()),
  );

  if (!can("hrms.payroll.view")) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to payroll"
          description="Payroll data is restricted to authorised roles."
        />
      </Card>
    );
  }

  if (periods.isLoading || payslips.isLoading || employees.isLoading) return <SectionSkeleton />;
  if (payslips.isError) return <SectionError onRetry={() => payslips.refetch()} />;

  const summaryById = new Map((summary.data ?? []).map((r) => [r.periodId, r]));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <PageHeader title="Payroll" />
          <p className="mt-1 text-sm text-text-secondary">
            Manage employee compensation, process payroll, and ensure compliance — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarDays
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <select
              value={selectedPeriod?.id ?? ""}
              onChange={(e) => {
                setSelectedPeriodId(e.target.value);
                setPage(1);
              }}
              className="h-10 appearance-none rounded-lg border border-border bg-surface pl-9 pr-8 text-sm font-medium text-text outline-none"
            >
              {periodList.length === 0 && <option value="">No periods</option>}
              {periodList.map((p) => (
                <option key={p.id} value={p.id}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
          </div>
          {canProcess ? (
            <Button onClick={() => setRunOpen(true)}>
              <Play className="mr-1.5 h-4 w-4" /> Run Payroll
            </Button>
          ) : null}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Users size={20} />}
          iconClass="bg-primary/10 text-primary"
          title="Total Employees"
          value={String(overview.data?.totalEmployees ?? employees.data?.length ?? 0)}
          subtitle={`${activeEmployees} active`}
        />
        <StatCard
          icon={<WalletCards size={20} />}
          iconClass="bg-success/10 text-success"
          title="Total Payroll Cost"
          value={money(selectedSummary?.grossTotal ?? null, currency)}
          subtitle="vs previous period"
          trend={trendPct != null ? `${trendPct > 0 ? "+" : ""}${trendPct}%` : undefined}
        />
        <StatCard
          icon={<FileText size={20} />}
          iconClass="bg-surface-elevated text-text-secondary"
          title="Processed"
          value={String(processedCount)}
          subtitle={
            activeEmployees > 0
              ? `${Math.round((processedCount / Math.max(activeEmployees, 1)) * 100)}% of total`
              : "No active employees"
          }
        />
        <StatCard
          icon={<Clock3 size={20} />}
          iconClass="bg-error/10 text-error"
          title="Pending"
          value={String(pendingCount)}
          subtitle={pendingCount > 0 ? "Requires attention" : "All caught up"}
        />
      </div>

      {/* Analytics row */}
      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.9fr_1fr]">
        <PayrollStepper period={selectedPeriod} />
        <CostTrend rows={summary.data ?? []} currency={currency} />
        <DepartmentDonut payslips={periodPayslips} employeeById={employeeById} currency={currency} />
      </div>

      {/* Table card */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-3 pt-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: "employees", label: "Employees" },
                { id: "approvals", label: `Approvals (${actionable.length})` },
                { id: "periods", label: "Periods" },
              ] as { id: TableTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative whitespace-nowrap px-3 py-2.5 text-xs font-medium",
                  tab === t.id ? "text-primary" : "text-text-muted hover:text-text",
                )}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          {tab === "employees" && (
            <div className="flex items-center gap-2 pb-2 lg:pb-0 lg:pr-1">
              <div className="flex h-9 w-52 items-center gap-2 rounded-lg border border-border px-2.5">
                <Search size={14} className="text-text-muted" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search employees..."
                  className="w-full bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
                />
              </div>
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none"
              >
                <option value="all">All Departments</option>
                {(departments.data ?? []).map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
              {canExport && selectedPeriod ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={exporting === selectedPeriod.id}
                  onClick={() => download(selectedPeriod)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* Employees tab */}
        {tab === "employees" && (
          <>
            {!selectedPeriod ? (
              <EmptyState
                icon={Wallet}
                title="No payroll period"
                description="Run payroll to create a period and generate payslips."
              />
            ) : periodPayslips.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No payslips"
                description="Payslips appear after this payroll run is processed."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="bg-surface-elevated/50 text-left">
                      {["Employee", "Department", "Designation", "Employment Type", "Gross", "Deductions", "Net Pay", "Status", ""].map(
                        (h) => (
                          <th key={h} className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold text-text-muted">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p) => {
                      const e = employeeById.get(p.employeeId);
                      return (
                        <tr
                          key={p.id}
                          className="cursor-pointer border-t border-border transition hover:bg-surface-elevated/40"
                          onClick={() => setDrawerPayslip(p)}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-[10px]">{initials(e)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="whitespace-nowrap text-xs font-semibold text-text">
                                  {p.employeeName ?? employeeName(e)}
                                </p>
                                <p className="text-[11px] text-text-muted">
                                  {e?.employeeNumber ?? p.employeeId.slice(0, 8)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 text-xs text-text-secondary">{employeeDept(e)}</td>
                          <td className="whitespace-nowrap px-4 text-xs text-text-secondary">{employeeTitle(e)}</td>
                          <td className="whitespace-nowrap px-4 text-xs capitalize text-text-secondary">
                            {e?.employmentType ?? "—"}
                          </td>
                          <td className="px-4 text-right text-xs text-text-secondary">
                            {money(grossOf(p), p.currency)}
                          </td>
                          <td className="px-4 text-right text-xs text-text-secondary">
                            {money(deductionsTotal(p), p.currency)}
                          </td>
                          <td className="px-4 text-right text-xs font-semibold text-text">
                            {money(netOf(p), p.currency)}
                          </td>
                          <td className="px-4">
                            <StatusBadge status={payslipStatusLabel(p.status)} />
                          </td>
                          <td className="px-4">
                            <Button variant="ghost" size="sm" aria-label="View payslip">
                              <ChevronRight size={15} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {pageRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-xs text-text-muted">
                          No employees match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {selectedPeriod && periodPayslips.length > 0 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-xs text-text-muted">
                  Showing {pageRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                  {(page - 1) * PAGE_SIZE + pageRows.length} of {filteredPayslips.length} employees
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  {Array.from({ length: Math.min(pageCount, 5) }).map((_, i) => {
                    const n = i + 1;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md text-xs",
                          page === n ? "bg-primary font-semibold text-white" : "text-text-muted hover:bg-surface-elevated",
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                  {pageCount > 5 && <span className="px-1 text-xs text-text-muted">…</span>}
                  {pageCount > 5 && (
                    <button
                      type="button"
                      onClick={() => setPage(pageCount)}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md text-xs",
                        page === pageCount ? "bg-primary font-semibold text-white" : "text-text-muted hover:bg-surface-elevated",
                      )}
                    >
                      {pageCount}
                    </button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Approvals tab */}
        {tab === "approvals" && (
          <div className="overflow-x-auto">
            {actionable.length === 0 ? (
              <EmptyState
                icon={Check}
                title="Nothing to action"
                description="Payroll periods needing processing, approval, or disbursement appear here."
              />
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-surface-elevated/50 text-left">
                    {["Period", "Headcount", "Gross", "Net", "Status", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold text-text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actionable.map((p) => {
                    const s = summaryById.get(p.id);
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-2.5 text-text">{periodLabel(p)}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{s?.headcount ?? "—"}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{money(s?.grossTotal, currency)}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{money(s?.netTotal, currency)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-2.5"><PeriodActions period={p} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Periods tab */}
        {tab === "periods" && (
          <div className="overflow-x-auto">
            {periods.isError ? (
              <SectionError onRetry={() => periods.refetch()} />
            ) : periodList.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No payroll periods"
                description="Payroll periods appear once payroll is configured."
              />
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-surface-elevated/50 text-left">
                    {["Period", "Dates", "Headcount", "Gross", "Net", "Status", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold text-text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodList.map((p) => {
                    const s = summaryById.get(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          "cursor-pointer border-t border-border hover:bg-surface-elevated/40",
                          selectedPeriod?.id === p.id && "bg-primary/5",
                        )}
                        onClick={() => {
                          setSelectedPeriodId(p.id);
                          setTab("employees");
                          setPage(1);
                        }}
                      >
                        <td className="px-4 py-2.5 text-text">{periodLabel(p)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-text-secondary">
                          {formatDate(p.startDate)} – {formatDate(p.endDate)}
                        </td>
                        <td className="px-4 py-2.5 text-text-secondary">{s?.headcount ?? "—"}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{money(s?.grossTotal, currency)}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{money(s?.netTotal, currency)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-2.5"><PeriodActions period={p} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {drawerPayslip && (
        <PayslipDrawer
          payslip={drawerPayslip}
          employee={employeeById.get(drawerPayslip.employeeId)}
          onClose={() => setDrawerPayslip(null)}
        />
      )}

      <RunPayrollDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        periods={periodList}
        employeeCount={activeEmployees}
      />
    </div>
  );
}

export function HrPayrollScreen() {
  const { can } = usePermissions();
  const isOperator = can("hrms.payroll.manage") || can("hrms.payroll.process");
  if (!isOperator) return <MyPayrollScreen />;
  return (
    <div className="p-4 sm:p-6">
      <PayrollOverview />
    </div>
  );
}
