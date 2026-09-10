import { useEffect } from "react";
import { X } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { WorkspaceSidebar } from "../navigation/workspace-sidebar";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);

  useEffect(() => {
    if (open) {
      setSidebarCollapsed(false);
      setSidebarWidth(320);
    } else {
      setSidebarCollapsed(true);
    }
  }, [open, setSidebarCollapsed, setSidebarWidth]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      <div
        className="h-full w-80 overflow-y-auto bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-end border-b px-3 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-text hover:bg-surface-elevated"
            aria-label="Close workspace menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <WorkspaceSidebar />
      </div>
      <div className="flex-1 bg-black/50" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
