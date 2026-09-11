import { useMemo } from "react";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { canAccessView } from "@/lib/view-permissions";
import { useUIStore, type View } from "@/stores/ui";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HomeScreen } from "@/screens/home";
import { InboxScreen } from "@/screens/inbox";
import { ChannelScreen } from "@/screens/channel";
import { DirectMessageScreen } from "@/screens/direct-message";
import { ProjectScreen } from "@/screens/project";
import { MeetingScreen } from "@/screens/meeting";
import { VoiceRoomScreen } from "@/screens/voice-room";
import { FileBrowserScreen } from "@/screens/file-browser";
import { AIAssistantScreen } from "@/screens/ai-assistant";
import { MemberDirectoryScreen } from "@/screens/members";
import { SavedItemsScreen } from "@/screens/saved";
import { DraftsScreen } from "@/screens/drafts";
import { SettingsScreen } from "@/screens/settings";
import { AccessDeniedScreen } from "@/screens/access-denied";
import { HrmsScreen } from "@/screens/hrms";
import { InterviewScreen } from "@/screens/interview";
import { AdminScreen } from "@/screens/admin";
import { HelpScreen } from "@/screens/help";

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
  hrms: HrmsScreen,
  interview: InterviewScreen,
  admin: AdminScreen,
  settings: SettingsScreen,
  help: HelpScreen,
};

export function ScreenContent() {
  const { user } = usePermissionContext();
  const activeView = useUIStore((s) => s.activeView);
  const viewAllowed = canAccessView(user, activeView);

  const Screen = useMemo(
    () => (viewAllowed ? screens[activeView] ?? HomeScreen : AccessDeniedScreen),
    [activeView, viewAllowed],
  );

  return (
    <ErrorBoundary>
      <div className="h-full w-full overflow-y-auto">
        <Screen />
      </div>
    </ErrorBoundary>
  );
}
