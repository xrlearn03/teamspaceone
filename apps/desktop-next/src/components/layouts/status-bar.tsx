import { Check, CloudUpload, RefreshCw, WifiOff } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useOrganisations, useWorkspaces } from "@/hooks/api";

export function StatusBar() {
  const connection = useUIStore((s) => s.connection);
  const pendingCount = useUIStore((s) => s.pendingCount);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const activeOrgId = useUIStore((s) => s.organisationId);
  const { data: organisations } = useOrganisations();
  const { data: workspaces } = useWorkspaces(activeOrgId ?? undefined);
  const organisation = organisations?.find((o) => o.id === activeOrgId);
  const workspace = workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0];

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-t bg-surface px-4 text-xs text-text-muted">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate font-medium text-text">{workspace?.name ?? organisation?.name ?? "Teamspace One"}</span>
        <span className="text-text-muted">·</span>
        <span className="truncate">{organisation?.slug ?? "workspace"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {connection === "connected" && (
          <>
            <Check className="h-3 w-3 text-online" />
            <span>Connected</span>
          </>
        )}
        {connection === "connecting" && (
          <>
            <RefreshCw className="h-3 w-3 animate-spin text-info" />
            <span>Connecting</span>
          </>
        )}
        {connection === "offline" && (
          <>
            <WifiOff className="h-3 w-3 text-error" />
            <span>Offline</span>
          </>
        )}
        {connection === "syncing" && (
          <>
            <RefreshCw className="h-3 w-3 animate-spin text-info" />
            <span>Syncing</span>
          </>
        )}
        {pendingCount > 0 ? (
          <>
            <span className="text-text-muted">·</span>
            <CloudUpload className="h-3 w-3 text-warning" />
            <span className="text-warning">{pendingCount} pending</span>
          </>
        ) : null}
        <span className="text-text-muted">·</span>
        <span>{connection === "offline" ? "Not synced" : "Synced"}</span>
        <span className="hidden text-text-muted md:inline">·</span>
        <span className="hidden md:inline">© Teamspace One</span>
      </div>
    </div>
  );
}
