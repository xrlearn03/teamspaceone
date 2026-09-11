import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useUIStore, type NotificationToast } from "@/stores/ui";
import { cn } from "@/lib/utils";

function ToastItem({ toast }: { toast: NotificationToast }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), 10000);
    const cleanup = setTimeout(() => useUIStore.getState().removeNotificationToast(toast.id), 10300);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hide);
      clearTimeout(cleanup);
    };
  }, [toast.id]);

  return (
    <div
      onClick={() => useUIStore.getState().setActiveView("inbox")}
      className={cn(
        "pointer-events-auto flex w-80 cursor-pointer items-start gap-3 rounded-lg border bg-surface-elevated p-4 shadow-lg transition-all duration-300",
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
      )}
    >
      <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{toast.title}</p>
        <p className="text-xs text-text-secondary line-clamp-2">{toast.body}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          setTimeout(() => useUIStore.getState().removeNotificationToast(toast.id), 300);
        }}
        className="text-text-muted hover:text-text"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function NotificationToasts() {
  const toasts = useUIStore((s) => s.notificationToasts);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
