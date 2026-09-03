import { Check, RefreshCw, WifiOff } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useOrganisations, useWorkspaces } from "../../hooks/api";
import { getActiveOrganisation } from "../../lib/api";

export function StatusBar() {
  const connection = useUIStore((s) => s.connection);
  const activeOrgId = getActiveOrganisation();
  const { data: organisations } = useOrganisations();
  const { data: workspaces } = useWorkspaces(activeOrgId ?? undefined);
  const organisation = organisations?.find((o) => o.id === activeOrgId);
  const workspace = workspaces?.[0];

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t bg-surface px-3 text-xs text-text-muted">
      <div className="flex items-center gap-3">
        <span className="font-medium text-text">{workspace?.name ?? organisation?.name ?? "Reactify"}</span>
        <span className="text-text-muted">·</span>
        <span>{organisation?.slug ?? "workspace"}</span>
      </div>
      <div className="flex items-center gap-2">
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
        <span className="text-text-muted">·</span>
        <span>Last synced just now</span>
      </div>
    </div>
  );
}
