"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToastStore, type Toast, type ToastKind } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ICONS: Record<ToastKind, typeof Info> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const ICON_CLASSES: Record<ToastKind, string> = {
  error: "text-error",
  success: "text-success",
  info: "text-info",
};

const DURATIONS: Record<ToastKind, number> = {
  error: 6000,
  success: 4000,
  info: 5000,
};

function ToastCard({ toast }: { toast: Toast }) {
  const [visible, setVisible] = useState(false);
  const duration = DURATIONS[toast.kind];
  const Icon = ICONS[toast.kind];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), duration);
    const cleanup = setTimeout(
      () => useToastStore.getState().dismiss(toast.id),
      duration + 300,
    );
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hide);
      clearTimeout(cleanup);
    };
  }, [toast.id, duration]);

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-80 items-start gap-3 rounded-lg border bg-surface-elevated p-4 shadow-lg transition-all duration-300",
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", ICON_CLASSES[toast.kind])} />
      <p className="min-w-0 flex-1 text-sm text-text">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setVisible(false);
          setTimeout(() => useToastStore.getState().dismiss(toast.id), 300);
        }}
        className="shrink-0 text-text-muted hover:text-text"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}
