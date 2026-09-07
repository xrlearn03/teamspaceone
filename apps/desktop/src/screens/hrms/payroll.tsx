import { ShieldAlert, Wallet } from "lucide-react";
import { usePayrollPeriods, usePayslips } from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
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

export function PayrollSection() {
  const { can } = usePermissions();
  const periods = usePayrollPeriods();
  const payslips = usePayslips();

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
    return period.name ?? `${formatDate(period.startDate)} – ${formatDate(period.endDate)}`;
  };

  return (
    <div className="flex flex-col gap-4">
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
