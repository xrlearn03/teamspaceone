import {
  Briefcase,
  Calendar,
  ClipboardCheck,
  Folder,
  Home,
  Inbox,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasAnyPermission } from "@teamspace-one/authorization";
import { useUIStore, type View } from "@/stores/ui";
import { useUnreadCount } from "@/hooks/api";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { activeView, setActiveView, setSearchOpen } = useUIStore();
  const { data: unread } = useUnreadCount();

  const { user: authzUser } = usePermissionContext();
  const canAny = (permissions?: string[]) =>
    !permissions || permissions.length === 0
      ? true
      : authzUser
        ? hasAnyPermission(authzUser, permissions)
        : false;

  const items: Array<{
    id: string;
    icon: React.ElementType;
    label: string;
    badge?: number;
    permissions?: string[];
    onClick?: () => void;
  }> = [
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

  return (
    <nav
      aria-label="Primary navigation"
      className="flex min-h-16 shrink-0 items-center border-t bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {items.slice(0, 5).map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick ?? (() => setActiveView(item.id as View))}
            className={cn(
              "flex min-h-16 h-auto min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-text-muted",
            )}
            aria-label={item.label}
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {(item.badge ?? 0) > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-2 w-2 rounded-full bg-mention" />
              ) : null}
            </div>
            <span className="block w-full text-center leading-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
