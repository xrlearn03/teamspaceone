import { useEffect } from "react";
import { useUIStore } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { useTheme } from "../../hooks/useTheme";
import { AppRail } from "../navigation/app-rail";
import { WorkspaceSidebar } from "../navigation/workspace-sidebar";
import { StatusBar } from "./status-bar";
import { RightPanel } from "./right-panel";
import { CommandMenu } from "../search/command-menu";
import { IncomingCallOverlay } from "../call/incoming-call";
import { NotificationToasts } from "../ui/notification-toasts";
import { TooltipProvider } from "../ui/tooltip";
import { ScreenContent } from "./screen-content";

export function AppShellDesktop() {
  useTheme();

  const {
    rightPanelOpen,
    searchOpen,
    connection,
    sidebarWidth,
    rightPanelWidth,
    setSearchOpen,
    setActiveView,
    setConnection,
    setSidebarWidth,
    setRightPanelWidth,
  } = useUIStore(
    useShallow((s) => ({
      rightPanelOpen: s.rightPanelOpen,
      searchOpen: s.searchOpen,
      connection: s.connection,
      sidebarWidth: s.sidebarWidth,
      rightPanelWidth: s.rightPanelWidth,
      setSearchOpen: s.setSearchOpen,
      setActiveView: s.setActiveView,
      setConnection: s.setConnection,
      setSidebarWidth: s.setSidebarWidth,
      setRightPanelWidth: s.setRightPanelWidth,
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "]") {
        e.preventDefault();
        setActiveView("inbox");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSearchOpen, setActiveView]);

  useEffect(() => {
    function onResize() {
      setSidebarWidth(sidebarWidth);
      setRightPanelWidth(rightPanelWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setSidebarWidth, setRightPanelWidth, sidebarWidth, rightPanelWidth]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
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
        <div className="flex flex-1 overflow-hidden">
          <AppRail />
          <WorkspaceSidebar />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <ScreenContent />
          </main>
          {rightPanelOpen && <RightPanel />}
        </div>
        <StatusBar />
      </div>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
      <IncomingCallOverlay />
      <NotificationToasts />
    </TooltipProvider>
  );
}
