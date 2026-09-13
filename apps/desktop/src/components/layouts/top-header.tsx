import { Bell, LogOut, Search, Settings } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { useMe, useUnreadCount } from "../../hooks/api";
import { logout } from "../../lib/api";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { getUserDisplayName } from "../../lib/utils";

const isMac =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent);

export function TopHeader() {
  const { setActiveView, setSearchOpen } = useUIStore(
    useShallow((s) => ({
      setActiveView: s.setActiveView,
      setSearchOpen: s.setSearchOpen,
    })),
  );
  const { data: user, isLoading: userLoading } = useMe();
  const { data: unread } = useUnreadCount();
  const displayName = getUserDisplayName(user, "User");

  async function signOut() {
    await logout();
    window.location.reload();
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-7 min-w-0 max-w-[259px] flex-1 items-center justify-between rounded-md border border-border bg-surface px-2.5 text-left sm:flex-none sm:basis-[259px]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="truncate text-xs text-text-muted">Search</span>
        </span>
        <span className="ml-2 hidden rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary sm:block">
          {isMac ? "⌘ K" : "Ctrl + K"}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveView("settings")}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setActiveView("inbox")}
          className="relative flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {(unread?.count ?? 0) > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-mention ring-2 ring-surface" />
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative ml-1 flex h-6 w-6 items-center justify-center rounded-full"
              aria-label="User menu"
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {userLoading ? "?" : displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-online" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem onClick={() => setActiveView("settings")}>
              Profile & settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-danger">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
