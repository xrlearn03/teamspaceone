import { useState } from "react";
import { Check, Download, Play, ShieldAlert, Wallet } from "lucide-react";
import {
  useApprovePayrollPeriod,
  useMarkPayrollPeriodPaid,
  usePayrollPeriods,
  usePayrollSummary,
  usePayslips,
  useProcessPayrollPeriod,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import { exportPayrollPeriodCsv } from "../../lib/api";
import type { PayrollPeriod } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "./common";

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

function periodLabel(p: PayrollPeriod) {
  return p.name ?? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`;
}

function PeriodActions({ period }: { period: PayrollPeriod }) {
  const { can } = usePermissions();
  const canManage = can("hrms.payroll.manage");
  const canProcess = can("hrms.payroll.process") || canManage;
  const canExport = can("hrms.payroll.export");
  const process = useProcessPayrollPeriod();
  const approve = useApprovePayrollPeriod();
  const markPaid = useMarkPayrollPeriodPaid();
  const [exporting, setExporting] = useState(false);
  const status = (period.status ?? "").toLowerCase();
  const busy = process.isPending || approve.isPending || markPaid.isPending || exporting;

  async function download() {
    setExporting(true);
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
      setExporting(false);
    }
  }

  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {canProcess && status === "draft" ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => process.mutate(period.id)}
        >
          <Play className="mr-1 h-3.5 w-3.5" /> Process
        </Button>
      ) : null}
      {canManage && status === "processed" ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => approve.mutate(period.id)}
        >
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
        <Button size="sm" variant="ghost" disabled={busy} onClick={download}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
        </Button>
      ) : null}
    </div>
  );
}

export function PayrollSection() {
  const { can } = usePermissions();
  const canManage = can("hrms.payroll.manage");
  const periods = usePayrollPeriods();
  const payslips = usePayslips();
  const summary = usePayrollSummary();

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

  if (periods.isLoading || payslips.isLoading) return <SectionSkeleton />;
  if (payslips.isError) return <SectionError onRetry={() => payslips.refetch()} />;

  const periodName = (id: string) => {
    const period = (periods.data ?? []).find((p) => p.id === id);
    if (!period) return "—";
    return periodLabel(period);
  };

  const totals = (summary.data ?? []).reduce(
    (acc, r) => ({ gross: acc.gross + (r.grossTotal ?? 0), net: acc.net + (r.netTotal ?? 0) }),
    { gross: 0, net: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      {canManage && (summary.data ?? []).length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Payroll summary</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Headcount</th>
                  <th className="px-4 py-2 font-medium">Gross</th>
                  <th className="px-4 py-2 font-medium">Net</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(summary.data ?? []).map((r) => (
                  <tr key={r.periodId} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-text">{r.name ?? periodName(r.periodId)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{r.headcount}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{money(r.grossTotal)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{money(r.netTotal)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
                <tr className="bg-surface-elevated/50">
                  <td className="px-4 py-2.5 text-xs font-medium text-text-secondary" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-text">{money(totals.gross)}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-text">{money(totals.net)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Payroll periods</CardTitle></CardHeader>
        <CardContent className="p-0">
          {periods.isError ? (
            <SectionError onRetry={() => periods.refetch()} />
          ) : (periods.data ?? []).length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payroll periods"
              description="Payroll periods appear once payroll is configured."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(periods.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-text">{periodLabel(p)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-2.5"><PeriodActions period={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(payslips.data ?? []).length === 0 ? (
            <EmptyState icon={Wallet} title="No payslips" description="Payslips appear after a payroll run is processed." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Gross</th>
                  <th className="px-4 py-2 font-medium">Net</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(payslips.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-text">{p.periodName ?? periodName(p.payrollPeriodId)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{p.employeeName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{money(p.gross, p.currency)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{money(p.net, p.currency)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
