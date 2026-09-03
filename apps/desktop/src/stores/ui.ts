import { create } from "zustand";

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
  | "settings";

interface UIState {
  theme: "light" | "dark" | "system";
  activeView: View;
  activeChannelId: string | null;
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  searchOpen: boolean;
  connection: "connected" | "connecting" | "offline" | "syncing";
  setTheme: (theme: "light" | "dark" | "system") => void;
  setActiveView: (
    view: View,
    params?: { channelId?: string; projectId?: string },
  ) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  setSearchOpen: (open: boolean) => void;
  setConnection: (connection: UIState["connection"]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "system",
  activeView: "home",
  activeChannelId: null,
  activeProjectId: null,
  sidebarCollapsed: false,
  sidebarWidth: 256,
  rightPanelOpen: false,
  rightPanelWidth: 320,
  searchOpen: false,
  connection: "connected",
  setTheme: (theme) => set({ theme }),
  setActiveView: (view, params) =>
    set({
      activeView: view,
      activeChannelId: params?.channelId ?? null,
      activeProjectId: params?.projectId ?? null,
    }),
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
