import { useEffect, useMemo } from "react";
import { useUIStore, type View } from "../../stores/ui";
import { useTheme } from "../../hooks/useTheme";
import { useShallow } from "zustand/shallow";
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
  settings: SettingsScreen,
};

export function AppShell() {
  useTheme();

  const { activeView, rightPanelOpen, searchOpen, setSearchOpen, setActiveView } =
    useUIStore(
      useShallow((s) => ({
        activeView: s.activeView,
        rightPanelOpen: s.rightPanelOpen,
        searchOpen: s.searchOpen,
        setSearchOpen: s.setSearchOpen,
        setActiveView: s.setActiveView,
      })),
    );

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
        <div className="flex flex-1 overflow-hidden">
          <AppRail />
          <WorkspaceSidebar />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <Screen />
          </main>
          {rightPanelOpen && <RightPanel />}
        </div>
        <StatusBar />
      </div>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </TooltipProvider>
  );
}
