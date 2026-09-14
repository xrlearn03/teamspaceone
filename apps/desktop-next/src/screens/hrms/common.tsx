import { AlertCircle } from "lucide-react";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { Skeleton } from "@teamspace-one/ui/skeleton";

export function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatMinutes(minutes?: number | null) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  const variant =
    s === "active" || s === "approved" || s === "present" || s === "paid" || s === "completed"
      ? "success"
      : s === "pending" || s === "requested" || s === "draft" || s === "processing" || s === "manager_approved"
        ? "warning"
        : s === "rejected" || s === "cancelled" || s === "inactive" || s === "absent" || s === "terminated"
          ? "error"
          : "secondary";
  const label = s === "manager_approved" ? "awaiting hr" : (status ?? "unknown");
  return <Badge variant={variant}>{label}</Badge>;
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function SectionError({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-error">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-text">Something went wrong</p>
      <p className="max-w-xs text-xs text-text-muted">{message ?? "Check your connection and try again."}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
