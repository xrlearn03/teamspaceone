import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardCard({
  icon: Icon,
  iconClassName,
  title,
  badge,
  actionLabel,
  onAction,
  className,
  children,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  title: ReactNode;
  badge?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-[0_3px_18px_rgba(20,50,90,.035)]",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              iconClassName ?? "bg-primary/10 text-primary",
            )}
          >
            <Icon size={15} />
          </div>
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {badge}
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-medium text-primary hover:underline"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const PILL_TONES = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
  info: "bg-primary/10 text-primary",
  neutral: "bg-surface-elevated text-text-secondary",
} as const;

export function StatusPill({
  tone = "success",
  className,
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface-elevated/50 px-4 py-3", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{value}</p>
    </div>
  );
}

export function CardActionButton({
  icon: Icon,
  variant = "outline",
  disabled,
  onClick,
  className,
  children,
}: {
  icon?: LucideIcon;
  variant?: "primary" | "outline";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold transition disabled:opacity-50",
        variant === "primary"
          ? "bg-primary text-white hover:bg-primary-hover"
          : "border border-border bg-surface text-text hover:bg-surface-elevated",
        className,
      )}
    >
      {Icon ? <Icon size={13} /> : null}
      {children}
    </button>
  );
}

export function CardToggleButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[10px] font-medium transition disabled:opacity-50",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-surface text-text-secondary hover:bg-surface-elevated",
        className,
      )}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
