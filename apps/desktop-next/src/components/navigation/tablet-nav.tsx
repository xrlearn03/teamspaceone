import {
  Briefcase,
  Calendar,
  ClipboardCheck,
  Folder,
  Home,
  Inbox,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasAnyPermission } from "@teamspace-one/authorization";
import { useUIStore, type View } from "@/stores/ui";
import { useMe, useUnreadCount } from "@/hooks/api";
import { logout } from "@/lib/api";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { cn } from "@/lib/utils";

export function TabletNav() {
  const { activeView, setActiveView, setSearchOpen } = useUIStore();
  const { data: user, isLoading: userLoading } = useMe();
  const { data: unread } = useUnreadCount();

  const { user: authzUser } = usePermissionContext();
  const canAny = (permissions?: string[]) =>
    !permissions || permissions.length === 0
      ? true
      : authzUser
        ? hasAnyPermission(authzUser, permissions)
        : false;

  const topItems = [
    { id: "home", icon: Home, label: "Home", permissions: ["dashboard.view"] },
    { id: "inbox", icon: Inbox, label: "Inbox", badge: unread?.count ?? 0 },
    { id: "dm", icon: MessageSquare, label: "Messages", permissions: ["collaboration.access"] },
    { id: "project", icon: Folder, label: "Projects", permissions: ["collaboration.project.view"] },
    { id: "meeting", icon: Calendar, label: "Meetings", permissions: ["collaboration.meeting.view"] },
    { id: "hrms", icon: Briefcase, label: "HRMS", permissions: ["hrms.access"] },
    { id: "interview", icon: ClipboardCheck, label: "Interview", permissions: ["interview.access"] },
    { id: "ai", icon: Sparkles, label: "AI" },
    { id: "search", icon: Search, label: "Search", onClick: () => setSearchOpen(true) },
  ].filter((item) => canAny(item.permissions));

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : user?.email ?? "User";

  return (
    <nav className="flex w-24 shrink-0 flex-col items-center border-r bg-surface py-3">
      <div className="flex flex-col items-center gap-2">
        <img src="/Teamspace%20One_light.svg" alt="Teamspace One" className="h-6 w-auto dark:hidden" />
        <img src="/Teamspace%20One_dark.svg" alt="Teamspace One" className="hidden h-6 w-auto dark:block" />
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto px-2">
        {topItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick ?? (() => setActiveView(item.id as View))}
              className={cn(
                "relative flex w-full flex-col items-center gap-1 rounded-md px-2 py-2 text-[10px] font-medium transition-colors",
                isActive
                  ? "bg-primary-subtle text-primary"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text",
              )}
              aria-label={item.label}
            >
              <Icon className="h-5 w-5" />
              <span className="w-full text-center leading-tight">{item.label}</span>
              {(item.badge ?? 0) > 0 ? (
                <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-mention" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => setActiveView("settings")}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md text-text-muted transition-colors",
            activeView === "settings" ? "bg-primary-subtle text-primary" : "hover:bg-surface-elevated hover:text-text",
          )}
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={async () => { await logout(); window.location.reload(); }}
          className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Sign out"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback>{userLoading ? "?" : displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      </div>
    </nav>
  );
}
