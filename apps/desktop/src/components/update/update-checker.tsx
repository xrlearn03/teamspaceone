import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { Button } from "@teamspace-one/ui/button";
import { cn } from "../../lib/utils";

/**
 * How often the updater endpoint is polled after the initial launch check.
 * A version the user dismissed once is not re-prompted, so this only nags
 * when a genuinely newer build shows up.
 */
const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

const MANUAL_CHECK_EVENT = "teamspace-one:check-for-updates";

/**
 * Fired on `window` when an interactive update check settles, so callers like
 * Settings → About can reflect the outcome even when no dialog opens (e.g.
 * when the app is already on the latest version).
 */
export const UPDATE_CHECK_RESULT_EVENT = "teamspace-one:update-check-result";

export type UpdateCheckResult = "latest" | "available" | "error";

function reportUpdateCheckResult(result: UpdateCheckResult) {
  window.dispatchEvent(new CustomEvent<UpdateCheckResult>(UPDATE_CHECK_RESULT_EVENT, { detail: result }));
}

/**
 * Triggers an interactive update check from anywhere in the app (e.g. the
 * Settings → About "Check for updates" button). Unlike the background poll,
 * failures surface in the update dialog instead of being logged and dropped.
 */
export function requestUpdateCheck() {
  window.dispatchEvent(new Event(MANUAL_CHECK_EVENT));
}

/** True only where the updater plugin is registered and a check can succeed. */
export function canUseDesktopUpdater(): boolean {
  return isTauriReleaseBuild();
}

type Phase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installed"
  | "error";

function isTauriDesktop(): boolean {
  // The updater plugin is only registered on desktop targets; the shared
  // frontend also runs in browsers and mobile webviews where the call would
  // fail, so guard on the Tauri internals marker plus a UA sanity check.
  if (typeof window === "undefined") return false;
  if (!("__TAURI_INTERNALS__" in window)) return false;
  return !/android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isTauriReleaseBuild(): boolean {
  // In `pnpm dev:desktop` the Rust side does not register the updater plugin,
  // but the JS guard here also skips the check in Vite dev mode so we don't
  // poll the update endpoint or log harmless plugin-not-found errors.
  return isTauriDesktop() && !import.meta.env.DEV;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

/**
 * Polls the configured updater endpoint, prompts when a newer build exists,
 * downloads + installs it, then asks the user to relaunch.
 *
 * On Windows the installer takes over and exits the app itself, so the
 * "restart" prompt is only reachable on macOS (and Linux if enabled later).
 */
export function UpdateChecker() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState(0);
  const [restartBusy, setRestartBusy] = useState(false);
  const dismissedVersion = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const checkForUpdate = useCallback(async (interactive = false) => {
    if (!isTauriReleaseBuild()) return;
    // A scheduled re-check must not stomp an open prompt, a running
    // download, or the restart prompt.
    if (!interactive && phaseRef.current !== "idle") return;
    setError(null);
    setPhase("checking");
    try {
      const result = await check();
      if (!result) {
        setPhase("idle");
        if (interactive) reportUpdateCheckResult("latest");
        return;
      }
      if (dismissedVersion.current === result.version && !interactive) {
        setPhase("idle");
        return;
      }
      setUpdate(result);
      setPhase("available");
      if (interactive) reportUpdateCheckResult("available");
    } catch (err) {
      // Network blips shouldn't surface as modal errors unless the user
      // explicitly asked for a check.
      setPhase("idle");
      if (interactive) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
        reportUpdateCheckResult("error");
      } else {
        console.warn("[updater] update check failed:", err);
      }
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
    const timer = setInterval(() => checkForUpdate(), RECHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [checkForUpdate]);

  useEffect(() => {
    const onManualCheck = () => checkForUpdate(true);
    window.addEventListener(MANUAL_CHECK_EVENT, onManualCheck);
    return () => window.removeEventListener(MANUAL_CHECK_EVENT, onManualCheck);
  }, [checkForUpdate]);

  async function startDownload() {
    if (!update) return;
    setDownloadedBytes(0);
    setContentLength(0);
    setPhase("downloading");
    try {
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setContentLength(event.data.contentLength ?? 0);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setDownloadedBytes(downloaded);
            break;
          case "Finished":
            break;
        }
      });
      // Reached on macOS/Linux. On Windows the installer already took over
      // and the process is gone before this resolves.
      setPhase("installed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  async function restartNow() {
    setRestartBusy(true);
    try {
      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRestartBusy(false);
    }
  }

  function dismiss() {
    if (update) dismissedVersion.current = update.version;
    setUpdate(null);
    setPhase("idle");
  }

  const open = phase === "available" || phase === "downloading" || phase === "installed" || phase === "error";
  const percent =
    contentLength > 0 ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100)) : null;

  return (
    <Dialog open={open}>
      <DialogContent
        className="w-full max-w-sm p-6"
        onEscapeKeyDown={(e) => phase === "downloading" && e.preventDefault()}
        onInteractOutside={(e) => phase === "downloading" && e.preventDefault()}
        onPointerDownOutside={(e) => phase === "downloading" && e.preventDefault()}
      >
        <DialogHeader className="p-0 pb-2">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle">
            {phase === "installed" ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : (
              <ArrowDownToLine className="h-5 w-5 text-primary" />
            )}
          </div>
          <DialogTitle>
            {phase === "installed"
              ? "Update ready to restart"
              : phase === "error"
                ? "Update failed"
                : `Update available — v${update?.version ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {phase === "available" && update
              ? `A new version of Teamspace One is available (you have v${update.currentVersion}).`
              : phase === "installed"
                ? "The update has been installed. Restart the app to finish."
                : phase === "downloading"
                  ? "Downloading and installing the update…"
                  : phase === "error"
                    ? "The update could not be downloaded or installed."
                    : null}
          </DialogDescription>
        </DialogHeader>

        {phase === "available" && update?.body ? (
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-elevated p-3 text-xs text-text-secondary">
            {update.body}
          </p>
        ) : null}

        {phase === "downloading" ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-[width]",
                  percent === null && "w-1/3 animate-pulse",
                )}
                style={percent !== null ? { width: `${percent}%` } : undefined}
              />
            </div>
            <p className="text-xs text-text-muted">
              {percent !== null
                ? `${percent}% — ${formatBytes(downloadedBytes)} of ${formatBytes(contentLength)}`
                : `${formatBytes(downloadedBytes)} downloaded`}
            </p>
          </div>
        ) : null}

        {phase === "error" && error ? (
          <p className="text-sm text-error">{error}</p>
        ) : null}

        <div className="mt-2 flex justify-end gap-2">
          {phase === "available" ? (
            <>
              <Button variant="ghost" onClick={dismiss}>
                Not now
              </Button>
              <Button onClick={startDownload}>Update now</Button>
            </>
          ) : null}

          {phase === "installed" ? (
            <>
              <Button variant="ghost" onClick={dismiss}>
                Later
              </Button>
              <Button onClick={restartNow} disabled={restartBusy}>
                {restartBusy ? "Restarting…" : "Restart now"}
              </Button>
            </>
          ) : null}

          {phase === "error" ? (
            <>
              <Button variant="ghost" onClick={dismiss}>
                Dismiss
              </Button>
              <Button onClick={startDownload}>Retry</Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
