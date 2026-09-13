import { create } from "zustand";

export type ToastKind = "error" | "success" | "info";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { ...toast, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      ],
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

function show(kind: ToastKind, message: string) {
  const { toasts, push } = useToastStore.getState();
  if (toasts.some((t) => t.kind === kind && t.message === message)) return;
  push({ kind, message });
}

// Repeating failures (polling queries, reconnect loops) share a cooldown so
// the same error can't spam a new toast every cycle.
const lastShownAt = new Map<string, number>();

function showThrottled(kind: ToastKind, message: string, cooldownMs: number) {
  const key = `${kind}:${message}`;
  const now = Date.now();
  if (now - (lastShownAt.get(key) ?? 0) < cooldownMs) return;
  lastShownAt.set(key, now);
  show(kind, message);
}

export const toast = {
  error: (message: string) => show("error", message),
  success: (message: string) => show("success", message),
  info: (message: string) => show("info", message),
};

export function toastError(err: unknown, fallback = "Something went wrong") {
  const message =
    err instanceof Error && err.message
      ? err.message
      : typeof err === "string" && err
        ? err
        : fallback;
  show("error", message);
}

/** Like toastError but suppresses repeats of the same message for `cooldownMs`. */
export function toastErrorThrottled(
  err: unknown,
  cooldownMs = 30_000,
  fallback = "Something went wrong",
) {
  const message =
    err instanceof Error && err.message
      ? err.message
      : typeof err === "string" && err
        ? err
        : fallback;
  showThrottled("error", message, cooldownMs);
}
