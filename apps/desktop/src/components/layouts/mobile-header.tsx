import { Menu, ChevronDown, ChevronLeft } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useOrganisations, useWorkspaces, useMe } from "../../hooks/api";
import { Avatar, AvatarFallback } from "../ui/avatar";

interface MobileHeaderProps {
  onOpenDrawer: () => void;
}

export function MobileHeader({ onOpenDrawer }: MobileHeaderProps) {
  const organisationId = useUIStore((s) => s.organisationId);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const activeView = useUIStore((s) => s.activeView);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const activeMeetingId = useUIStore((s) => s.activeMeetingId);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: me } = useMe();
  const { data: organisations } = useOrganisations();
  const { data: workspaces } = useWorkspaces(organisationId ?? undefined);

  const organisation = organisations?.find((o) => o.id === organisationId);
  const workspace = workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0];

  const displayName = me?.firstName
    ? `${me.firstName} ${me.lastName ?? ""}`.trim()
    : me?.email ?? "User";

  const isSubView = Boolean(activeChannelId || activeProjectId || activeMeetingId || activeView === "voice");

  const viewTitle: Record<string, string> = {
    home: "Home",
    inbox: "Inbox",
    channel: "Channel",
    dm: "Messages",
    project: "Project",
    meeting: "Meeting",
    voice: "Voice call",
    files: "Files",
    ai: "AI",
    members: "Members",
    saved: "Saved",
    drafts: "Drafts",
    hrms: "HRMS",
    interview: "Interview",
    admin: "Admin",
    settings: "Settings",
  };

  function goBack() {
    if (activeView === "channel") {
      setActiveView("home");
    } else if (activeView === "voice") {
      setActiveView("meeting");
    } else {
      setActiveView(activeView);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-surface px-4 pt-[env(safe-area-inset-top)]">
      {isSubView ? (
        <button
          type="button"
          onClick={goBack}
          className="flex h-10 w-10 items-center justify-center rounded-md text-text hover:bg-surface-elevated"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex h-10 w-10 items-center justify-center rounded-md text-text hover:bg-surface-elevated"
          aria-label="Open workspace menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <button
        type="button"
        className="flex flex-1 items-center justify-center gap-1 overflow-hidden px-2 text-base font-medium text-text"
      >
        <span className="truncate">
          {isSubView ? (viewTitle[activeView] ?? "Teamspace One") : (workspace?.name ?? organisation?.name ?? "Teamspace One")}
        </span>
        {!isSubView ? <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" /> : null}
      </button>

      <Avatar className="h-9 w-9">
        <AvatarFallback className="text-xs">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
    </header>
  );
}
