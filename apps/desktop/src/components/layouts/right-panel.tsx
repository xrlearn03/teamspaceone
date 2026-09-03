import { X } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { EmptyState } from "../ui/empty-state";
import { Info } from "lucide-react";

export function RightPanel() {
  const { rightPanelOpen, rightPanelWidth, toggleRightPanel } = useUIStore(
    useShallow((s) => ({
      rightPanelOpen: s.rightPanelOpen,
      rightPanelWidth: s.rightPanelWidth,
      toggleRightPanel: s.toggleRightPanel,
    })),
  );

  if (!rightPanelOpen) return null;

  return (
    <aside
      className="flex shrink-0 flex-col border-l bg-surface"
      style={{ width: rightPanelWidth }}
    >
      <div className="flex h-12 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold text-text">Details</span>
        <button
          type="button"
          onClick={toggleRightPanel}
          className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Close details panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EmptyState
          icon={Info}
          title="No details"
          description="Select a message, task, or project to see context here."
        />
      </div>
    </aside>
  );
}
