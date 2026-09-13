import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  Landmark,
  Link2,
  PieChart,
  Receipt,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Button } from "@teamspace-one/ui/button";
import {
  useMyEmployee,
  usePayslips,
  usePayrollPeriods,
} from "@/hooks/api";
import {
  getPayslip,
  type Employee,
  type PayrollPeriod,
  type Payslip,
} from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import {
  SectionError,
  SectionSkeleton,
  StatusBadge,
  formatDate,
} from "./hrms/common";

type PayrollTab =
  | "payslips"
  | "breakup"
  | "tax"
  | "reimbursements"
  | "history";

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

function grossOf(p: Payslip) {
  return p.gross ?? p.grossPay ?? null;
}

function netOf(p: Payslip) {
  return p.net ?? p.netPay ?? null;
}

function deductionsOf(p: Payslip) {
  const gross = grossOf(p);
  const net = netOf(p);
  return gross != null && net != null ? gross - net : null;
}

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

function prettyLabel(key: string) {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()) || "Amount";
}

function payslipDate(
  p: Payslip,
  periods: Map<string, PayrollPeriod>,
): Date | null {
  const iso = periods.get(p.payrollPeriodId)?.startDate ?? p.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthLabel(
  p: Payslip,
  periods: Map<string, PayrollPeriod>,
): string {
  const period = periods.get(p.payrollPeriodId);
  if (period?.name) return period.name;
  const d = payslipDate(p, periods);
  return d
    ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "—";
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function daysUntil(date: Date) {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

/* ------------------------------------------------------------------ */
/* Client-side document generation (no PDF service exists yet — these  */
/* download a printable HTML document the user can save as PDF).       */
/* ------------------------------------------------------------------ */

const DOC_STYLES =
  "body{font-family:system-ui,sans-serif;color:#1c1917;max-width:640px;margin:40px auto;padding:0 24px}" +
  "h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:16px 0}" +
  "td,th{padding:8px 4px;border-bottom:1px solid #e7e5e4;font-size:13px;text-align:left}" +
  "td:last-child,th:last-child{text-align:right}.muted{color:#78716c;font-size:12px}" +
  ".total td{font-weight:600;border-bottom:none;border-top:2px solid #1c1917}";

function saveHtmlDocument(filename: string, title: string, bodyHtml: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${DOC_STYLES}</style></head><body>${bodyHtml}</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function breakdownRows(
  entries: Record<string, number> | null | undefined,
  currency?: string | null,
) {
  return Object.entries(entries ?? {})
    .map(
      ([key, value]) =>
        `<tr><td>${prettyLabel(key)}</td><td>${money(value, currency)}</td></tr>`,
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function SummaryCard({
  icon,
  iconClass,
  title,
  value,
  subtitle,
  valueClass,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  value: string;
  subtitle: string;
  valueClass?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-border bg-surface px-5 py-5">
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
          iconClass,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-text-secondary">{title}</p>
        <p
          className={cn(
            "mt-1.5 truncate text-2xl font-semibold tracking-tight text-text",
            valueClass,
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 truncate text-xs text-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-14 items-center gap-2.5 px-4 text-sm transition-colors",
        active ? "font-medium text-primary" : "text-text-secondary hover:text-text",
      )}
    >
      {icon}
      {label}
      {active ? (
        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-xs font-medium text-text">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payslips tab                                                        */
/* ------------------------------------------------------------------ */

function PayslipsTable({
  payslips,
  periods,
  currency,
  onDownload,
  downloading,
}: {
  payslips: Payslip[];
  periods: Map<string, PayrollPeriod>;
  currency?: string | null;
  onDownload: (p: Payslip) => void;
  downloading: string | null;
}) {
  if (payslips.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No payslips yet"
        description="Payslips appear here after a payroll run is processed."
      />
    );
  }
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px]">
        <thead className="bg-surface-elevated">
          <tr className="h-11 text-left">
            <th className="px-3 text-[11px] font-medium text-text-muted">Month</th>
            <th className="px-3 text-[11px] font-medium text-text-muted">Gross Salary</th>
            <th className="px-3 text-[11px] font-medium text-text-muted">Deductions</th>
            <th className="px-3 text-[11px] font-medium text-text-muted">Net Salary</th>
            <th className="px-3 text-[11px] font-medium text-text-muted">Status</th>
            <th className="px-3 text-[11px] font-medium text-text-muted">Actions</th>
          </tr>
        </thead>
        <tbody>
          {payslips.map((p) => (
            <tr
              key={p.id}
              className="h-[52px] border-t border-border transition-colors hover:bg-surface-elevated/60"
            >
              <td className="px-3 text-xs font-medium text-text">
                {monthLabel(p, periods)}
              </td>
              <td className="px-3 text-xs text-text-secondary">
                {money(grossOf(p), p.currency ?? currency)}
              </td>
              <td className="px-3 text-xs text-text-secondary">
                {money(deductionsOf(p), p.currency ?? currency)}
              </td>
              <td className="px-3 text-xs font-medium text-text">
                {money(netOf(p), p.currency ?? currency)}
              </td>
              <td className="px-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-3">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={downloading === p.id}
                  onClick={() => onDownload(p)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {downloading === p.id ? "Preparing…" : "Download"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CertificateCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="relative flex items-center overflow-hidden rounded-xl bg-primary-subtle/60 px-5 py-5">
        <div className="relative z-10 flex-1">
          <h3 className="text-base font-semibold text-text">
            Need a salary certificate?
          </h3>
          <p className="mt-1.5 max-w-[280px] text-xs leading-5 text-text-secondary">
            Generate a salary certificate instantly for bank loans, visas, or
            other purposes.
          </p>
          <Button className="mt-4" size="sm" onClick={onGenerate}>
            Generate Certificate
          </Button>
        </div>
        <div className="relative mr-2 hidden h-28 w-20 md:block">
          <div className="absolute right-2 top-1 h-24 w-16 rounded-md border border-border bg-surface shadow-sm">
            <div className="absolute left-3 top-4 h-1 w-9 rounded bg-primary/60" />
            <div className="absolute left-3 top-9 h-1 w-10 rounded bg-primary/40" />
            <div className="absolute left-3 top-14 h-1 w-7 rounded bg-primary/40" />
          </div>
          <div className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-md">
            <Download className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SalaryChart({
  monthly,
  currency,
  year,
  years,
  onYearChange,
}: {
  monthly: { label: string; gross: number; net: number }[];
  currency?: string | null;
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
}) {
  const max = Math.max(1, ...monthly.map((m) => m.gross));
  const compact = (v: number) =>
    new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text">
          Annual Salary Overview
        </h2>
        <select
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-text-secondary outline-none"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {monthly.every((m) => m.gross === 0) ? (
        <p className="mt-8 text-center text-xs text-text-muted">
          No salary data for {year}.
        </p>
      ) : (
        <div className="mt-6 flex h-[150px] gap-3">
          <div className="flex flex-col justify-between pb-6 text-[9px] text-text-muted">
            {[1, 0.75, 0.5, 0.25, 0].map((f) => (
              <span key={f}>{f === 0 ? "0" : compact(max * f)}</span>
            ))}
          </div>
          <div className="relative flex flex-1 flex-col">
            <div className="absolute inset-0 flex flex-col justify-between pb-6">
              {[0, 1, 2, 3, 4].map((line) => (
                <div key={line} className="border-t border-border/60" />
              ))}
            </div>
            <div className="relative flex h-full items-end justify-between gap-1 pb-6">
              {monthly.map((item) => (
                <div
                  key={item.label}
                  className="relative flex h-full flex-1 items-end justify-center gap-[2px]"
                >
                  <div
                    className="w-2 rounded-t bg-primary"
                    style={{ height: `${(item.gross / max) * 100}%` }}
                    title={`Gross ${money(item.gross, currency)}`}
                  />
                  <div
                    className="w-2 rounded-t bg-info/60"
                    style={{ height: `${(item.net / max) * 100}%` }}
                    title={`Net ${money(item.net, currency)}`}
                  />
                  <span className="absolute bottom-0 text-[9px] text-text-muted">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-[10px] text-text-muted">Gross</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-info/60" />
          <span className="text-[10px] text-text-muted">Net</span>
        </div>
      </div>
    </div>
  );
}

function RecentPayments({
  payslips,
  periods,
  currency,
  onViewAll,
}: {
  payslips: Payslip[];
  periods: Map<string, PayrollPeriod>;
  currency?: string | null;
  onViewAll: () => void;
}) {
  const recent = payslips.slice(0, 3);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <SectionHeader
        icon={<CalendarDays className="h-5 w-5" />}
        title="Recent Payments"
        subtitle="Your latest salary credit details"
        action={
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-medium text-primary hover:text-primary-hover"
          >
            View All
          </button>
        }
      />
      {recent.length === 0 ? (
        <p className="mt-6 text-center text-xs text-text-muted">
          No payments recorded yet.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px]">
            <thead className="bg-surface-elevated">
              <tr className="h-11 text-left">
                <th className="px-3 text-[11px] font-medium text-text-muted">Date</th>
                <th className="px-3 text-[11px] font-medium text-text-muted">Amount</th>
                <th className="px-3 text-[11px] font-medium text-text-muted">Reference</th>
                <th className="px-3 text-[11px] font-medium text-text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="h-14 border-t border-border">
                  <td className="px-3 text-xs text-text-secondary">
                    {formatDate(
                      periods.get(p.payrollPeriodId)?.endDate ?? p.createdAt,
                    )}
                  </td>
                  <td className="px-3 text-xs font-medium text-text">
                    {money(netOf(p), p.currency ?? currency)}
                  </td>
                  <td className="px-3 font-mono text-xs text-text-muted">
                    {shortId(p.id)}
                  </td>
                  <td className="px-3">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuickLinks({ onOpen }: { onOpen: (tab: PayrollTab) => void }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const links = [
    {
      title: "Tax & Investments",
      subtitle: "View details",
      icon: <FileText className="h-4 w-4" />,
      className: "bg-primary-subtle text-primary",
      onClick: () => onOpen("tax"),
    },
    {
      title: "Salary Breakup",
      subtitle: "Earnings & deductions",
      icon: <BarChart3 className="h-4 w-4" />,
      className: "bg-success/10 text-success",
      onClick: () => onOpen("breakup"),
    },
    {
      title: "Payment History",
      subtitle: "All transactions",
      icon: <FileCheck2 className="h-4 w-4" />,
      className: "bg-info/10 text-info",
      onClick: () => onOpen("history"),
    },
    {
      title: "Help & Support",
      subtitle: "Get assistance",
      icon: <HelpCircle className="h-4 w-4" />,
      className: "bg-warning/10 text-warning",
      onClick: () => setActiveView("help"),
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <SectionHeader
        icon={<Link2 className="h-5 w-5" />}
        title="Quick Links"
        subtitle="Common payroll related actions"
      />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {links.map((link) => (
          <button
            key={link.title}
            type="button"
            onClick={link.onClick}
            className={cn(
              "min-h-[68px] rounded-xl p-3 text-left transition-shadow hover:shadow-sm",
              link.className,
            )}
          >
            <div className="flex items-center gap-2">
              {link.icon}
              <span className="text-[11px] font-medium text-text">
                {link.title}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-text-secondary">{link.subtitle}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Other tabs                                                          */
/* ------------------------------------------------------------------ */

function SalaryBreakup({
  payslip,
  currency,
}: {
  payslip?: Payslip;
  currency?: string | null;
}) {
  if (!payslip) {
    return (
      <EmptyState
        icon={Wallet}
        title="No salary data"
        description="Your salary breakup appears once a payslip is generated."
      />
    );
  }

  const earnings = Object.entries(payslip.earnings ?? {});
  const deductions = Object.entries(payslip.deductions ?? {});
  const gross = grossOf(payslip);
  const net = netOf(payslip);
  const totalDeductions = deductionsOf(payslip);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success">
            <ArrowUpRight className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text">Earnings</h2>
            <p className="text-xs text-text-secondary">
              Monthly salary components
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {earnings.length === 0 ? (
            <p className="text-xs text-text-muted">No earnings breakdown.</p>
          ) : (
            earnings.map(([name, amount]) => (
              <div
                key={name}
                className="flex justify-between border-b border-border pb-3"
              >
                <span className="text-xs text-text-secondary">
                  {prettyLabel(name)}
                </span>
                <span className="text-xs font-medium text-text">
                  {money(amount, payslip.currency ?? currency)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="mt-5 flex justify-between rounded-lg bg-success/10 px-4 py-3">
          <span className="text-xs font-semibold text-text">Total Gross</span>
          <span className="text-sm font-semibold text-success">
            {money(gross, payslip.currency ?? currency)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-error/10 text-error">
            <ArrowDownToLine className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text">Deductions</h2>
            <p className="text-xs text-text-secondary">Monthly deductions</p>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {deductions.length === 0 ? (
            <p className="text-xs text-text-muted">No deductions recorded.</p>
          ) : (
            deductions.map(([name, amount]) => (
              <div
                key={name}
                className="flex justify-between border-b border-border pb-3"
              >
                <span className="text-xs text-text-secondary">
                  {prettyLabel(name)}
                </span>
                <span className="text-xs font-medium text-text">
                  {money(amount, payslip.currency ?? currency)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="mt-5 flex justify-between rounded-lg bg-error/10 px-4 py-3">
          <span className="text-xs font-semibold text-text">
            Total Deductions
          </span>
          <span className="text-sm font-semibold text-error">
            {money(totalDeductions, payslip.currency ?? currency)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary-subtle/40 p-5 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-secondary">Monthly Take Home</p>
            <p className="mt-1 text-3xl font-semibold text-primary">
              {money(net, payslip.currency ?? currency)}
            </p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-subtle text-primary">
            <Wallet className="h-6 w-6" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaxInvestments({
  annualGross,
  annualDeductions,
  currency,
  year,
}: {
  annualGross: number | null;
  annualDeductions: number | null;
  currency?: string | null;
  year: number;
}) {
  const items = [
    {
      title: `Gross Income (${year})`,
      value: money(annualGross, currency),
      icon: <CircleDollarSign className="h-5 w-5" />,
    },
    {
      title: `Deductions (${year})`,
      value: money(annualDeductions, currency),
      icon: <PieChart className="h-5 w-5" />,
    },
    {
      title: "Tax Regime",
      value: "—",
      icon: <Landmark className="h-5 w-5" />,
    },
    {
      title: "TDS Paid",
      value: "—",
      icon: <Receipt className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              {item.icon}
            </div>
            <p className="mt-4 text-xs text-text-secondary">{item.title}</p>
            <p className="mt-1 text-base font-semibold text-text">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-base font-semibold text-text">
            Tax & Investment Documents
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Tax declarations and submitted proofs will appear here.
          </p>
        </div>
        <div className="mt-4">
          <EmptyState
            icon={FileText}
            title="No tax documents yet"
            description="Documents like Form 16 and investment proofs appear once your organisation uploads them."
          />
        </div>
      </div>
    </div>
  );
}

function Reimbursements() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-base font-semibold text-text">Reimbursements</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Track your submitted expense claims.
        </p>
      </div>
      <div className="mt-4">
        <EmptyState
          icon={CreditCard}
          title="No reimbursements"
          description="Expense claims you submit will show up here once reimbursements are enabled."
        />
      </div>
    </div>
  );
}

function PaymentHistory({
  payslips,
  periods,
  currency,
  onDownload,
  downloading,
}: {
  payslips: Payslip[];
  periods: Map<string, PayrollPeriod>;
  currency?: string | null;
  onDownload: (p: Payslip) => void;
  downloading: string | null;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return payslips;
    return payslips.filter((p) =>
      [monthLabel(p, periods), p.id, p.status]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [payslips, periods, query]);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">Payment History</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Complete record of salary payments.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search payments…"
            className="h-10 w-52 rounded-lg border border-border bg-surface pl-9 pr-3 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-xs text-text-muted">
          {query ? "No payments match your search." : "No payments recorded yet."}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px]">
            <thead className="bg-surface-elevated">
              <tr className="h-11 text-left">
                <th className="px-4 text-[11px] font-medium text-text-muted">Period</th>
                <th className="px-4 text-[11px] font-medium text-text-muted">Amount</th>
                <th className="px-4 text-[11px] font-medium text-text-muted">Reference</th>
                <th className="px-4 text-[11px] font-medium text-text-muted">Status</th>
                <th className="px-4 text-[11px] font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="h-14 border-t border-border">
                  <td className="px-4 text-xs text-text-secondary">
                    {monthLabel(p, periods)}
                  </td>
                  <td className="px-4 text-xs font-semibold text-text">
                    {money(netOf(p), p.currency ?? currency)}
                  </td>
                  <td className="px-4 font-mono text-xs text-text-muted">
                    {shortId(p.id)}
                  </td>
                  <td className="px-4">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4">
                    <button
                      type="button"
                      disabled={downloading === p.id}
                      onClick={() => onDownload(p)}
                      className="text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-50"
                    >
                      {downloading === p.id ? "Preparing…" : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Certificate dialog                                                  */
/* ------------------------------------------------------------------ */

function CertificateDialog({
  open,
  onOpenChange,
  employee,
  latestPayslip,
  currency,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee;
  latestPayslip?: Payslip;
  currency?: string | null;
  onDownload: () => void;
}) {
  const gross = latestPayslip ? grossOf(latestPayslip) : null;
  const employeeName = employee
    ? `${employee.firstName} ${employee.lastName}`.trim()
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Salary Certificate</DialogTitle>
          <DialogDescription>
            A certificate summarising your employment and compensation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border p-4">
            <InfoRow label="Employee" value={employeeName} />
            <InfoRow
              label="Designation"
              value={
                employee?.designation?.title ??
                employee?.designation?.name ??
                employee?.designationName ??
                "—"
              }
            />
            <InfoRow
              label="Department"
              value={
                employee?.department?.name ?? employee?.departmentName ?? "—"
              }
            />
            <InfoRow
              label="Employment Type"
              value={employee?.employmentType ?? "—"}
            />
            <InfoRow
              label="Joining Date"
              value={formatDate(employee?.joiningDate)}
            />
            <InfoRow
              label="Monthly Gross"
              value={money(gross, latestPayslip?.currency ?? currency)}
            />
            <InfoRow
              label="Annual Gross"
              value={money(
                gross != null ? gross * 12 : null,
                latestPayslip?.currency ?? currency,
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onDownload}>
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function MyPayrollScreen() {
  const { can } = usePermissions();
  const me = useMyEmployee();
  const periods = usePayrollPeriods();
  const payslips = usePayslips(
    me.data ? { employeeId: me.data.id } : undefined,
  );

  const [activeTab, setActiveTab] = useState<PayrollTab>("payslips");
  const [year, setYear] = useState<number | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const periodById = useMemo(
    () => new Map((periods.data ?? []).map((p) => [p.id, p])),
    [periods.data],
  );

  // Employees are own-scoped server-side, so an unfiltered list is already
  // theirs. Operators (manage/process/export) get org-wide rows back — keep
  // only their own, and show nothing when they have no employee record.
  const isPayrollOperator =
    can("hrms.payroll.manage") ||
    can("hrms.payroll.process") ||
    can("hrms.payroll.export");

  const myPayslips = useMemo(() => {
    const mine = (payslips.data ?? []).filter((p) =>
      me.data ? p.employeeId === me.data.id : !isPayrollOperator,
    );
    return [...mine].sort((a, b) => {
      const da = payslipDate(a, periodById)?.getTime() ?? 0;
      const db = payslipDate(b, periodById)?.getTime() ?? 0;
      return db - da;
    });
  }, [payslips.data, me.data, periodById, isPayrollOperator]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of myPayslips) {
      const d = payslipDate(p, periodById);
      if (d) set.add(d.getFullYear());
    }
    if (set.size === 0) set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [myPayslips, periodById]);

  const activeYear = year ?? years[0] ?? new Date().getFullYear();

  const yearPayslips = useMemo(
    () =>
      myPayslips.filter(
        (p) => payslipDate(p, periodById)?.getFullYear() === activeYear,
      ),
    [myPayslips, periodById, activeYear],
  );

  const latest = yearPayslips[0] ?? myPayslips[0];
  const currency = latest?.currency ?? myPayslips[0]?.currency ?? null;

  const monthly = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(2000, i, 1).toLocaleDateString(undefined, {
        month: "short",
      }),
      gross: 0,
      net: 0,
    }));
    for (const p of yearPayslips) {
      const d = payslipDate(p, periodById);
      if (!d) continue;
      const slot = months[d.getMonth()];
      slot.gross = Math.max(slot.gross, grossOf(p) ?? 0);
      slot.net = Math.max(slot.net, netOf(p) ?? 0);
    }
    return months;
  }, [yearPayslips, periodById]);

  const nextPayout = useMemo(() => {
    const now = Date.now();
    const upcoming = (periods.data ?? [])
      .map((p) => new Date(p.endDate))
      .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() >= now)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (upcoming) return upcoming;
    return new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  }, [periods.data]);

  const annualGross = useMemo(
    () =>
      yearPayslips.length
        ? yearPayslips.reduce((sum, p) => sum + (grossOf(p) ?? 0), 0)
        : null,
    [yearPayslips],
  );
  const annualDeductions = useMemo(
    () =>
      yearPayslips.length
        ? yearPayslips.reduce((sum, p) => sum + (deductionsOf(p) ?? 0), 0)
        : null,
    [yearPayslips],
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  async function handleDownloadPayslip(p: Payslip) {
    setDownloading(p.id);
    try {
      const detail = await getPayslip(p.id);
      const label = monthLabel(detail, periodById);
      const cur = detail.currency ?? currency;
      const rows =
        breakdownRows(detail.earnings, cur) ||
        `<tr><td>Gross</td><td>${money(grossOf(detail), cur)}</td></tr>`;
      const deductions = breakdownRows(detail.deductions, cur);
      saveHtmlDocument(
        `payslip-${label.replace(/[^\w-]+/g, "-").toLowerCase()}.html`,
        `Payslip — ${label}`,
        `<h1>Payslip — ${label}</h1>` +
          `<p class="muted">Status: ${detail.status} · Reference: ${detail.id}</p>` +
          `<table><tr><th>Earnings</th><th></th></tr>${rows}` +
          (deductions ? `<tr><th>Deductions</th><th></th></tr>${deductions}` : "") +
          `<tr class="total"><td>Net pay</td><td>${money(netOf(detail), cur)}</td></tr></table>`,
      );
      showToast(`${label} payslip downloaded.`);
    } catch {
      showToast("Couldn't download that payslip. Try again.");
    } finally {
      setDownloading(null);
    }
  }

  function handleDownloadCertificate() {
    const employee = me.data;
    const name = employee
      ? `${employee.firstName} ${employee.lastName}`.trim()
      : "Employee";
    const gross = latest ? grossOf(latest) : null;
    const cur = latest?.currency ?? currency;
    saveHtmlDocument(
      `salary-certificate-${new Date().getFullYear()}.html`,
      "Salary Certificate",
      `<h1>Salary Certificate</h1>` +
        `<p class="muted">Generated ${formatDate(new Date().toISOString())}</p>` +
        `<table>` +
        `<tr><td>Employee</td><td>${name}</td></tr>` +
        `<tr><td>Designation</td><td>${employee?.designation?.title ?? employee?.designation?.name ?? employee?.designationName ?? "—"}</td></tr>` +
        `<tr><td>Department</td><td>${employee?.department?.name ?? employee?.departmentName ?? "—"}</td></tr>` +
        `<tr><td>Employment type</td><td>${employee?.employmentType ?? "—"}</td></tr>` +
        `<tr><td>Joining date</td><td>${formatDate(employee?.joiningDate)}</td></tr>` +
        `<tr><td>Monthly gross</td><td>${money(gross, cur)}</td></tr>` +
        `<tr class="total"><td>Annual gross</td><td>${money(gross != null ? gross * 12 : null, cur)}</td></tr>` +
        `</table>`,
    );
    setShowCertificate(false);
    showToast("Salary certificate downloaded.");
  }

  if (!can("hrms.payroll.view")) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to payroll"
          description="Payroll data is restricted to authorised roles."
        />
      </div>
    );
  }

  const loading = payslips.isLoading || me.isLoading;

  const gross = latest ? grossOf(latest) : null;
  const net = latest ? netOf(latest) : null;
  const deductions = latest ? deductionsOf(latest) : null;

  return (
    <div className="min-h-full bg-background p-4 text-text sm:p-6">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                My Payroll
              </h1>
              <p className="mt-0.5 text-sm text-text-secondary">
                View your salary details, payslips, tax information and more
              </p>
            </div>
          </div>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <select
              value={activeYear}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-11 w-36 appearance-none rounded-xl border border-border bg-surface pl-10 pr-9 text-sm font-medium text-text outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<CircleDollarSign className="h-6 w-6" />}
            iconClass="bg-info/10 text-info"
            title="Monthly Gross"
            value={money(gross, currency)}
            subtitle={
              latest ? monthLabel(latest, periodById) : "No payslip yet"
            }
          />
          <SummaryCard
            icon={<Wallet className="h-6 w-6" />}
            iconClass="bg-success/10 text-success"
            title="Monthly Net (Take Home)"
            value={money(net, currency)}
            subtitle="Credited after payroll is paid"
          />
          <SummaryCard
            icon={<PieChart className="h-6 w-6" />}
            iconClass="bg-error/10 text-error"
            title="Total Deductions"
            value={money(deductions, currency)}
            valueClass="text-error"
            subtitle="Tax, insurance & other deductions"
          />
          <SummaryCard
            icon={<CalendarDays className="h-6 w-6" />}
            iconClass="bg-primary-subtle text-primary"
            title="Next Payout"
            value={nextPayout.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            subtitle={`In ${daysUntil(nextPayout)} days`}
          />
        </section>

        <nav className="mt-6 flex items-center overflow-x-auto border-b border-border">
          <TabButton
            active={activeTab === "payslips"}
            icon={<CalendarDays className="h-4 w-4" />}
            label="Payslips"
            onClick={() => setActiveTab("payslips")}
          />
          <TabButton
            active={activeTab === "breakup"}
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            label="Salary Breakup"
            onClick={() => setActiveTab("breakup")}
          />
          <TabButton
            active={activeTab === "tax"}
            icon={<Receipt className="h-4 w-4" />}
            label="Tax & Investments"
            onClick={() => setActiveTab("tax")}
          />
          <TabButton
            active={activeTab === "reimbursements"}
            icon={<CreditCard className="h-4 w-4" />}
            label="Reimbursements"
            onClick={() => setActiveTab("reimbursements")}
          />
          <TabButton
            active={activeTab === "history"}
            icon={<CircleDollarSign className="h-4 w-4" />}
            label="Payment History"
            onClick={() => setActiveTab("history")}
          />
        </nav>

        {loading ? (
          <div className="mt-6">
            <SectionSkeleton rows={5} />
          </div>
        ) : payslips.isError ? (
          <div className="mt-6 rounded-xl border border-border bg-surface">
            <SectionError onRetry={() => payslips.refetch()} />
          </div>
        ) : activeTab === "payslips" ? (
          <>
            <main className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.95fr)]">
              <div className="rounded-xl border border-border bg-surface p-4">
                <SectionHeader
                  icon={<FileText className="h-5 w-5" />}
                  title="Payslips"
                  subtitle="Download and view your monthly payslips"
                />
                <PayslipsTable
                  payslips={yearPayslips}
                  periods={periodById}
                  currency={currency}
                  onDownload={handleDownloadPayslip}
                  downloading={downloading}
                />
              </div>
              <div className="space-y-5">
                <CertificateCard onGenerate={() => setShowCertificate(true)} />
                <SalaryChart
                  monthly={monthly}
                  currency={currency}
                  year={activeYear}
                  years={years}
                  onYearChange={setYear}
                />
              </div>
            </main>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.95fr)]">
              <RecentPayments
                payslips={yearPayslips}
                periods={periodById}
                currency={currency}
                onViewAll={() => setActiveTab("history")}
              />
              <QuickLinks onOpen={setActiveTab} />
            </div>
          </>
        ) : activeTab === "breakup" ? (
          <main className="mt-5">
            <SalaryBreakup payslip={latest} currency={currency} />
          </main>
        ) : activeTab === "tax" ? (
          <main className="mt-5">
            <TaxInvestments
              annualGross={annualGross}
              annualDeductions={annualDeductions}
              currency={currency}
              year={activeYear}
            />
          </main>
        ) : activeTab === "reimbursements" ? (
          <main className="mt-5">
            <Reimbursements />
          </main>
        ) : (
          <main className="mt-5">
            <PaymentHistory
              payslips={yearPayslips}
              periods={periodById}
              currency={currency}
              onDownload={handleDownloadPayslip}
              downloading={downloading}
            />
          </main>
        )}

        <footer className="mt-5 flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Your payroll information is securely managed by HRMS.
          </div>
        </footer>
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-xl bg-text px-5 py-4 text-sm text-background shadow-xl">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {toast}
        </div>
      ) : null}

      <CertificateDialog
        open={showCertificate}
        onOpenChange={setShowCertificate}
        employee={me.data}
        latestPayslip={latest}
        currency={currency}
        onDownload={handleDownloadCertificate}
      />
    </div>
  );
}
