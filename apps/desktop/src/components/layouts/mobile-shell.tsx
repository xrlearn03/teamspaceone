import { useEffect, useState } from "react";
import { useUIStore } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { useTheme } from "../../hooks/useTheme";
import { TooltipProvider } from "../ui/tooltip";
import { CommandMenu } from "../search/command-menu";
import { IncomingCallOverlay } from "../call/incoming-call";
import { NotificationToasts } from "../ui/notification-toasts";
import { ScreenContent } from "./screen-content";
import { BottomNav } from "../navigation/bottom-nav";
import { StatusBar } from "./status-bar";
import { MobileHeader } from "./mobile-header";
import { MobileDrawer } from "./mobile-drawer";

export function MobileShell() {
  useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { connection, searchOpen, setSearchOpen, setConnection } = useUIStore(
    useShallow((s) => ({
      connection: s.connection,
      searchOpen: s.searchOpen,
      setSearchOpen: s.setSearchOpen,
      setConnection: s.setConnection,
    })),
  );

  useEffect(() => {
    function onOffline() {
      setConnection("offline");
    }
    function onOnline() {
      setConnection("connecting");
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!navigator.onLine) setConnection("offline");
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [setConnection]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col">
        <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        {connection === "offline" ? (
          <div className="flex items-center justify-center gap-2 bg-warning/10 px-4 py-1.5 text-xs text-warning">
            You're offline — messages are queued locally and will send when you reconnect.
          </div>
        ) : null}
        {connection === "syncing" ? (
          <div className="flex items-center justify-center gap-2 bg-info/10 px-4 py-1.5 text-xs text-info">
            Syncing pending changes…
          </div>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <ScreenContent />
        </main>
        <StatusBar />
        <BottomNav />
      </div>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
      <IncomingCallOverlay />
      <NotificationToasts />
    </TooltipProvider>
  );
}
