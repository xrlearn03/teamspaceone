import {
  Calendar,
  Folder,
  HelpCircle,
  Home,
  Inbox,
  LogOut,
  MessageSquare,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { useMe, useOrganisations, useUnreadCount } from "../../hooks/api";
import {
  getActiveOrganisation,
  setActiveOrganisation,
  clearAccessToken,
} from "../../lib/api";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

export function AppRail() {
  const { activeView, sidebarCollapsed, toggleSidebar, setActiveView, setSearchOpen } =
    useUIStore(
      useShallow((s) => ({
        activeView: s.activeView,
        sidebarCollapsed: s.sidebarCollapsed,
        toggleSidebar: s.toggleSidebar,
        setActiveView: s.setActiveView,
        setSearchOpen: s.setSearchOpen,
      })),
    );

  const { data: user, isLoading: userLoading } = useMe();
  const { data: organisations } = useOrganisations();
  const { data: unread } = useUnreadCount();
  const activeOrgId = getActiveOrganisation();

  function navigate(view: View) {
    setActiveView(view);
  }

  async function switchOrganisation(id: string) {
    setActiveOrganisation(id);
    navigate("home");
  }

  async function signOut() {
    await clearAccessToken();
    window.location.reload();
  }

  const topItems: Array<{
    id: View | "search" | "help" | "settings" | "workspace";
    icon: React.ElementType;
    label: string;
    onClick?: () => void;
    badge?: number;
  }> = [
    { id: "home", icon: Home, label: "Home" },
    { id: "inbox", icon: Inbox, label: "Inbox", badge: unread?.count ?? 0 },
    { id: "dm", icon: MessageSquare, label: "Messages" },
    { id: "project", icon: Folder, label: "Projects" },
    { id: "meeting", icon: Calendar, label: "Meetings" },
    { id: "ai", icon: Sparkles, label: "AI Assistant" },
    { id: "search", icon: Search, label: "Search", onClick: () => setSearchOpen(true) },
  ];

  const bottomItems = [
    { id: "settings", icon: Settings, label: "Settings", onClick: () => navigate("settings") },
    { id: "help", icon: HelpCircle, label: "Help", onClick: () => navigate("home") },
  ];

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : user?.email ?? "User";

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center border-r bg-surface py-2">
      <div className="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"
              aria-label="Reactify Connect"
            >
              <span className="text-xs font-bold">R</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Reactify Connect</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mt-2 flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-text hover:bg-border"
              aria-label="Switch organisation"
            >
              <Users className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" sideOffset={8}>
            {organisations?.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => switchOrganisation(org.id)}
              >
                <span className="flex flex-1 items-center justify-between">
                  {org.name}
                  {org.id === activeOrgId && (
                    <span className="text-xs text-text-muted">current</span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
            {(!organisations || organisations.length === 0) && (
              <DropdownMenuItem disabled>No organisations</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto px-1">
        {topItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={item.onClick ?? (() => navigate(item.id as View))}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors",
                    isActive
                      ? "bg-primary-subtle text-primary"
                      : "hover:bg-surface-elevated hover:text-text",
                  )}
                  aria-label={item.label}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {(item.badge ?? 0) > 0 ? (
                    <span className="absolute right-0.5 top-0.5 flex h-2 w-2 rounded-full bg-mention" />
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1 px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors",
                sidebarCollapsed ? "bg-primary-subtle text-primary" : "hover:bg-surface-elevated hover:text-text",
              )}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>

        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={item.onClick}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors",
                    isActive
                      ? "bg-primary-subtle text-primary"
                      : "hover:bg-surface-elevated hover:text-text",
                  )}
                  aria-label={item.label}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative mt-1 flex h-8 w-8 items-center justify-center rounded-full"
              aria-label="User menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {userLoading ? "?" : displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
                  "bg-online",
                )}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" sideOffset={8}>
            <DropdownMenuItem onClick={() => navigate("settings")}>
              Profile & settings
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Set status</DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-danger">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
