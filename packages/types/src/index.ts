export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  launchAtLogin: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  notificationEnabled: boolean;
  soundsEnabled: boolean;
  userId?: string;
  workspaceId?: string;
  lastSyncAt?: string;
}

export interface OfflineQueueItem {
  id: string;
  type: string;
  payload: unknown;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SecureToken {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface DesktopInfo {
  platform: string;
  arch: string;
  version: string;
}
