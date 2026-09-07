import {
  Briefcase,
  Calendar,
  ClipboardCheck,
  Folder,
  HelpCircle,
  Home,
  Inbox,
  LogOut,
  MessageSquare,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasAnyPermission } from "@teamspace-one/authorization";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { useMe, useOrganisations, useUnreadCount } from "../../hooks/api";
import { useSwitchOrganisation } from "../../hooks/useOrganisationSwitch";
import { logout } from "../../lib/api";
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
  const activeOrgId = useUIStore((s) => s.organisationId);
  const switchOrganisation = useSwitchOrganisation();

  function navigate(view: View) {
    setActiveView(view);
  }

  async function signOut() {
    await logout();
    window.location.reload();
  }

  const { user: authzUser } = usePermissionContext();
  const canAny = (permissions?: string[]) =>
    !permissions || permissions.length === 0
      ? true
      : authzUser
        ? hasAnyPermission(authzUser, permissions)
        : false;

  const topItems: Array<{
    id: string;
    icon: React.ElementType;
    label: string;
    onClick?: () => void;
    badge?: number;
    permissions?: string[];
  }> = [
    { id: "home", icon: Home, label: "Home", permissions: ["dashboard.view"] },
    { id: "inbox", icon: Inbox, label: "Inbox", badge: unread?.count ?? 0 },
    { id: "dm", icon: MessageSquare, label: "Messages", permissions: ["collaboration.access"] },
    { id: "project", icon: Folder, label: "Projects", permissions: ["collaboration.project.view"] },
    { id: "meeting", icon: Calendar, label: "Meetings", permissions: ["collaboration.meeting.view"] },
    { id: "hrms", icon: Briefcase, label: "HRMS", permissions: ["hrms.access"] },
    { id: "interview", icon: ClipboardCheck, label: "Interview", permissions: ["interview.access"] },
    { id: "ai", icon: Sparkles, label: "AI Assistant" },
    { id: "search", icon: Search, label: "Search", onClick: () => setSearchOpen(true) },
  ].filter((item) => canAny(item.permissions));

  const bottomItems: Array<{
    id: string;
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    permissions?: string[];
  }> = [
    {
      id: "admin",
      icon: ShieldCheck,
      label: "Administration",
      onClick: () => navigate("admin"),
      permissions: ["admin.user.manage", "admin.role.manage", "admin.organization.settings"],
    },
    { id: "settings", icon: Settings, label: "Settings", onClick: () => navigate("settings") },
    { id: "help", icon: HelpCircle, label: "Help", onClick: () => navigate("home") },
  ].filter((item) => canAny(item.permissions));

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
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              aria-label="Teamspace One"
            >
              <img
                src="/Teamspace%20One_light.svg"
                alt="Teamspace One"
                className="h-6 w-auto dark:hidden"
              />
              <img
                src="/Teamspace%20One_dark.svg"
                alt="Teamspace One"
                className="hidden h-6 w-auto dark:block"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>Teamspace One</TooltipContent>
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
