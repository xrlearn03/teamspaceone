import { ShieldAlert } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { useUIStore } from "@/stores/ui";

export function AccessDeniedScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-3 sm:p-4 lg:p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated">
        <ShieldAlert className="h-7 w-7 text-text-muted" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-text">Access denied</h1>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">
          You don&apos;t have permission to view this area. Contact your
          organisation administrator if you believe this is a mistake.
        </p>
      </div>
      <Button variant="secondary" onClick={() => setActiveView("home")}>
        Back to home
      </Button>
    </div>
  );
}
