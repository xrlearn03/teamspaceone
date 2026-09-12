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

export function AdminHeader() {
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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#e5e7eb] bg-white px-6">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-7 w-[259px] items-center justify-between rounded-[5px] border border-[#e5e7eb] bg-white px-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-[#9ca3af]" />
          <span className="text-xs text-[#9ca3af]">Search in HRMS</span>
        </span>
        <span className="rounded-[5px] bg-[#e8e9ea] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">
          CTRL + /
        </span>
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveView("settings")}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setActiveView("inbox")}
          className="relative flex h-[30px] w-[30px] items-center justify-center rounded-[5px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {(unread?.count ?? 0) > 0 && (
            <span className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-[#f6cece] p-[3px]">
              <span className="h-full w-full rounded-full bg-[#e70d0d]" />
            </span>
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
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#03c95a]" />
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
