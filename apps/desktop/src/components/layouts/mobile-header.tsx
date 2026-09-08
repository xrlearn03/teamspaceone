import { Menu, ChevronDown } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useOrganisations, useWorkspaces, useMe } from "../../hooks/api";
import { Avatar, AvatarFallback } from "../ui/avatar";

interface MobileHeaderProps {
  onOpenDrawer: () => void;
}

export function MobileHeader({ onOpenDrawer }: MobileHeaderProps) {
  const organisationId = useUIStore((s) => s.organisationId);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const { data: me } = useMe();
  const { data: organisations } = useOrganisations();
  const { data: workspaces } = useWorkspaces(organisationId ?? undefined);

  const organisation = organisations?.find((o) => o.id === organisationId);
  const workspace = workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0];

  const displayName = me?.firstName
    ? `${me.firstName} ${me.lastName ?? ""}`.trim()
    : me?.email ?? "User";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-surface px-3 pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={onOpenDrawer}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text hover:bg-surface-elevated"
        aria-label="Open workspace menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        type="button"
        className="flex flex-1 items-center justify-center gap-1 overflow-hidden px-2 text-sm font-medium text-text"
      >
        <span className="truncate">{workspace?.name ?? organisation?.name ?? "Teamspace One"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
      </button>

      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-[10px]">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
    </header>
  );
}
