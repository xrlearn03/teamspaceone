import { create } from "zustand";
import { getActiveOrganisation } from "../lib/api";

export type View =
  | "home"
  | "inbox"
  | "channel"
  | "dm"
  | "project"
  | "meeting"
  | "voice"
  | "files"
  | "ai"
  | "members"
  | "saved"
  | "drafts"
  | "settings";

interface UIState {
  organisationId: string | null;
  theme: "light" | "dark" | "system";
  activeView: View;
  activeChannelId: string | null;
  activeProjectId: string | null;
  activeMeetingId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  searchOpen: boolean;
  connection: "connected" | "connecting" | "offline" | "syncing";
  pendingCount: number;
  activeWorkspaceId: string | null;
  setOrganisation: (organisationId: string) => void;
  setPendingCount: (count: number) => void;
  setActiveWorkspace: (workspaceId: string | null) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setActiveView: (
    view: View,
    params?: { channelId?: string; projectId?: string; meetingId?: string },
  ) => void;
  setActiveMeetingId: (meetingId: string | null) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  setSearchOpen: (open: boolean) => void;
  setConnection: (connection: UIState["connection"]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  organisationId: getActiveOrganisation(),
  theme: "system",
  activeView: "home",
  activeChannelId: null,
  activeProjectId: null,
  activeMeetingId: null,
  sidebarCollapsed: false,
  sidebarWidth: 256,
  rightPanelOpen: false,
  rightPanelWidth: 320,
  searchOpen: false,
  connection: "connected",
  pendingCount: 0,
  activeWorkspaceId: localStorage.getItem(
    `teamspace-one:${getActiveOrganisation() ?? "none"}:activeWorkspace`,
  ),
  setOrganisation: (organisationId) =>
    set({
      organisationId,
      activeView: "home",
      activeChannelId: null,
      activeProjectId: null,
      activeMeetingId: null,
      rightPanelOpen: false,
      searchOpen: false,
      pendingCount: 0,
      activeWorkspaceId: localStorage.getItem(`teamspace-one:${organisationId}:activeWorkspace`),
    }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setActiveWorkspace: (workspaceId) => {
    const key = `teamspace-one:${getActiveOrganisation() ?? "none"}:activeWorkspace`;
    if (workspaceId) localStorage.setItem(key, workspaceId);
    else localStorage.removeItem(key);
    set({ activeWorkspaceId: workspaceId });
  },
  setTheme: (theme) => set({ theme }),
  setActiveView: (view, params) =>
    set({
      activeView: view,
      activeChannelId: params?.channelId ?? null,
      activeProjectId: params?.projectId ?? null,
      activeMeetingId: params?.meetingId ?? null,
    }),
  setActiveMeetingId: (meetingId) => set({ activeMeetingId: meetingId }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarWidth: (width) =>
    set({ sidebarWidth: Math.max(180, Math.min(400, width)) }),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelWidth: (width) =>
    set({ rightPanelWidth: Math.max(240, Math.min(480, width)) }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setConnection: (connection) => set({ connection }),
}));
