import { create } from "zustand";
import { getActiveOrganisation } from "@/lib/api";

function getSidebarWidthDefault() {
  if (typeof window === "undefined") return 256;
  return Math.min(288, Math.round(window.innerWidth * 0.18));
}

function getRightPanelWidthDefault() {
  if (typeof window === "undefined") return 320;
  return Math.min(320, Math.round(window.innerWidth * 0.18));
}

function clampSidebarWidth(width: number) {
  const max =
    typeof window === "undefined"
      ? 400
      : Math.min(360, Math.round(window.innerWidth * 0.25));
  return Math.max(180, Math.min(max, width));
}

function clampRightPanelWidth(width: number) {
  const max =
    typeof window === "undefined"
      ? 480
      : Math.min(420, Math.round(window.innerWidth * 0.25));
  return Math.max(220, Math.min(max, width));
}

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
  | "hrms"
  | "interview"
  | "admin"
  | "assets"
  | "tickets"
  | "hr-dashboard"
  | "employees"
  | "employee-detail"
  | "departments"
  | "designations"
  | "leaves"
  | "my-attendance"
  | "my-leaves"
  | "my-payroll"
  | "my-performance"
  | "settings"
  | "help";

export interface NotificationToast {
  id: string;
  title: string;
  body: string;
  resourceType?: string | null;
  link?: string | null;
}

interface UIState {
  organisationId: string | null;
  theme: "light" | "dark" | "system";
  activeView: View;
  activeChannelId: string | null;
  activeProjectId: string | null;
  activeMeetingId: string | null;
  activeEmployeeId: string | null;
  hrmsTab: string | null;
  helpTab: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  searchOpen: boolean;
  connection: "connected" | "connecting" | "offline" | "syncing";
  pendingCount: number;
  activeWorkspaceId: string | null;
  pendingActionFilter: string | null;
  notificationToasts: NotificationToast[];
  setOrganisation: (organisationId: string | null) => void;
  setPendingCount: (count: number) => void;
  setActiveWorkspace: (workspaceId: string | null) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setActiveView: (
    view: View,
    params?: { channelId?: string; projectId?: string; meetingId?: string; employeeId?: string; hrmsTab?: string; helpTab?: string },
  ) => void;
  setHrmsTab: (tab: string | null) => void;
  setHelpTab: (tab: string | null) => void;
  setActiveMeetingId: (meetingId: string | null) => void;
  setPendingActionFilter: (filter: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  setSearchOpen: (open: boolean) => void;
  setConnection: (connection: UIState["connection"]) => void;
  addNotificationToast: (toast: Omit<NotificationToast, "id">) => void;
  removeNotificationToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  organisationId: getActiveOrganisation(),
  theme: "system",
  activeView: "home",
  activeChannelId: null,
  activeProjectId: null,
  activeMeetingId: null,
  activeEmployeeId: null,
  hrmsTab: null,
  helpTab: null,
  sidebarCollapsed: false,
  sidebarWidth: getSidebarWidthDefault(),
  rightPanelOpen: false,
  rightPanelWidth: getRightPanelWidthDefault(),
  searchOpen: false,
  connection: "connected",
  pendingCount: 0,
  activeWorkspaceId:
    typeof window !== "undefined"
      ? localStorage.getItem(
          `teamspace-one:${getActiveOrganisation() ?? "none"}:activeWorkspace`,
        )
      : null,
  pendingActionFilter: null,
  notificationToasts: [],
  setOrganisation: (organisationId) =>
    set({
      organisationId,
      activeView: "home",
      activeChannelId: null,
      activeProjectId: null,
      activeMeetingId: null,
      activeEmployeeId: null,
      hrmsTab: null,
      helpTab: null,
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
      activeEmployeeId: params?.employeeId ?? null,
      hrmsTab: params?.hrmsTab ?? (view === "hrms" ? "overview" : null),
      helpTab: params?.helpTab ?? (view === "help" ? "tutorials" : null),
    }),
  setHrmsTab: (tab) => set({ hrmsTab: tab }),
  setHelpTab: (tab) => set({ helpTab: tab }),
  setActiveMeetingId: (meetingId) => set({ activeMeetingId: meetingId }),
  setPendingActionFilter: (filter) => set({ pendingActionFilter: filter }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSidebarWidth: (width) =>
    set({ sidebarWidth: clampSidebarWidth(width) }),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelWidth: (width) =>
    set({ rightPanelWidth: clampRightPanelWidth(width) }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setConnection: (connection) => set({ connection }),
  addNotificationToast: (toast) =>
    set((s) => ({
      notificationToasts: [...s.notificationToasts, { ...toast, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }],
    })),
  removeNotificationToast: (id) =>
    set((s) => ({
      notificationToasts: s.notificationToasts.filter((t) => t.id !== id),
    })),
}));
