import { useEffect, useMemo } from "react";
import { useUIStore, type View } from "../../stores/ui";
import { useTheme } from "../../hooks/useTheme";
import { useShallow } from "zustand/shallow";
import { ErrorBoundary } from "../ErrorBoundary";
import { AppRail } from "../navigation/app-rail";
import { WorkspaceSidebar } from "../navigation/workspace-sidebar";
import { StatusBar } from "./status-bar";
import { RightPanel } from "./right-panel";
import { CommandMenu } from "../search/command-menu";
import { TooltipProvider } from "../ui/tooltip";
import { HomeScreen } from "../../screens/home";
import { InboxScreen } from "../../screens/inbox";
import { ChannelScreen } from "../../screens/channel";
import { DirectMessageScreen } from "../../screens/direct-message";
import { ProjectScreen } from "../../screens/project";
import { MeetingScreen } from "../../screens/meeting";
import { VoiceRoomScreen } from "../../screens/voice-room";
import { FileBrowserScreen } from "../../screens/file-browser";
import { AIAssistantScreen } from "../../screens/ai-assistant";
import { MemberDirectoryScreen } from "../../screens/members";
import { SavedItemsScreen } from "../../screens/saved";
import { DraftsScreen } from "../../screens/drafts";
import { SettingsScreen } from "../../screens/settings";

const screens: Record<View, React.ComponentType> = {
  home: HomeScreen,
  inbox: InboxScreen,
  channel: ChannelScreen,
  dm: DirectMessageScreen,
  project: ProjectScreen,
  meeting: MeetingScreen,
  voice: VoiceRoomScreen,
  files: FileBrowserScreen,
  ai: AIAssistantScreen,
  members: MemberDirectoryScreen,
  saved: SavedItemsScreen,
  drafts: DraftsScreen,
  settings: SettingsScreen,
};

export function AppShell() {
  useTheme();

  const { activeView, rightPanelOpen, searchOpen, connection, setSearchOpen, setActiveView, setConnection } =
    useUIStore(
      useShallow((s) => ({
        activeView: s.activeView,
        rightPanelOpen: s.rightPanelOpen,
        searchOpen: s.searchOpen,
        connection: s.connection,
        setSearchOpen: s.setSearchOpen,
        setActiveView: s.setActiveView,
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

  const Screen = useMemo(() => screens[activeView] ?? HomeScreen, [activeView]);

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
            <ErrorBoundary>
              <Screen />
            </ErrorBoundary>
          </main>
          {rightPanelOpen && <RightPanel />}
        </div>
        <StatusBar />
      </div>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </TooltipProvider>
  );
}
