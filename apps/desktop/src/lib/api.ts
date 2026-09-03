import { invoke } from "@tauri-apps/api/core";

const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? "http://localhost:3000";
const TOKEN_SERVICE = "reactify-connect";
const TOKEN_ACCOUNT = "access-token";

let activeOrganisationId: string | null = null;

export function setActiveOrganisation(organisationId: string | null): void {
  activeOrganisationId = organisationId;
  if (organisationId) {
    localStorage.setItem("reactify:organisationId", organisationId);
  } else {
    localStorage.removeItem("reactify:organisationId");
  }
}

export function getActiveOrganisation(): string | null {
  if (activeOrganisationId) return activeOrganisationId;
  return localStorage.getItem("reactify:organisationId");
}

export async function setAccessToken(token: string): Promise<void> {
  await invoke("store_secure_token", {
    service: TOKEN_SERVICE,
    account: TOKEN_ACCOUNT,
    token,
  });
}

export async function getAccessToken(): Promise<string | null> {
  return invoke<string | null>("get_secure_token", {
    service: TOKEN_SERVICE,
    account: TOKEN_ACCOUNT,
  });
}

export async function clearAccessToken(): Promise<void> {
  await invoke("delete_secure_token", {
    service: TOKEN_SERVICE,
    account: TOKEN_ACCOUNT,
  });
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  org?: string | null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const org = options.org ?? getActiveOrganisation();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (org) {
    headers["x-organisation-id"] = org;
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
  };

  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      delete headers["Content-Type"];
      init.body = options.body;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${GATEWAY_URL}${path}`, init);
  if (response.status === 401) {
    await clearAccessToken();
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error ${response.status}: ${text}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

// Auth
export function register(email: string, password: string) {
  return apiRequest<{ id: string; email: string }>("/auth/register", {
    method: "POST",
    body: { email, password },
  });
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ accessToken: string; refreshToken: string }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await setAccessToken(result.accessToken);
  return result;
}

export function getMe() {
  return apiRequest<{ id: string; email: string }>("/auth/me");
}

// Organisations
export function getOrganisations() {
  return apiRequest<Array<{ id: string; name: string }>>("/organisations");
}

export function createOrganisation(name: string) {
  return apiRequest<{ id: string; name: string }>("/organisations", {
    method: "POST",
    body: { name },
  });
}

// Messaging
export function createChannel(name: string, workspaceId?: string) {
  return apiRequest<{ id: string; name: string }>("/channels", {
    method: "POST",
    body: { name, workspaceId },
  });
}

export function getMessages(channelId: string) {
  return apiRequest<Array<{ id: string; senderId: string; content: string; createdAt: string }>>(
    `/channels/${channelId}/messages`,
  );
}

export function sendMessage(channelId: string, content: string) {
  return apiRequest<{ id: string }>("/messages", {
    method: "POST",
    body: { channelId, content },
  });
}

// Projects
export function createProject(name: string, description?: string, workspaceId?: string) {
  return apiRequest<{ id: string; name: string }>("/projects", {
    method: "POST",
    body: { name, description, workspaceId },
  });
}

export function getProjects() {
  return apiRequest<Array<{ id: string; name: string }>>("/projects");
}

export function getTasks(projectId: string) {
  return apiRequest<Array<{ id: string; title: string; status: string }>>(`/projects/${projectId}/tasks`);
}

export function createTask(projectId: string, title: string, description?: string) {
  return apiRequest<{ id: string }>("/tasks", {
    method: "POST",
    body: { projectId, title, description },
  });
}

// Files
export function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ id: string; originalName: string; url: string }>("/files/upload", {
    method: "POST",
    body: form,
  });
}

// Search
export function search(query: string) {
  return apiRequest<Array<{ resourceType: string; resourceId: string; content: string }>>(
    `/search?q=${encodeURIComponent(query)}`,
  );
}

// Meetings
export interface Meeting {
  id: string;
  roomName: string;
  title: string;
  description?: string | null;
  status: string;
  type: string;
  createdBy: string;
  participants?: MeetingParticipant[];
}

export interface MeetingParticipant {
  id: string;
  userId: string;
  joinedAt: string;
  leftAt?: string | null;
  isScreenSharing: boolean;
}

export interface JoinMeetingResult {
  participant: MeetingParticipant;
  token: string;
}

export interface MeetingTokenResult {
  token: string;
  roomName: string;
}

export function getMeetings() {
  return apiRequest<Meeting[]>("/meetings");
}

export function getMeeting(id: string) {
  return apiRequest<Meeting>(`/meetings/${id}`);
}

export function createMeeting(title: string, description?: string, workspaceId?: string) {
  return apiRequest<Meeting>("/meetings", {
    method: "POST",
    body: { title, description, workspaceId },
  });
}

export function createVoiceRoom(title: string, workspaceId?: string) {
  return apiRequest<Meeting>("/meetings/voice-rooms", {
    method: "POST",
    body: { title, workspaceId },
  });
}

export function startMeeting(id: string) {
  return apiRequest<Meeting>(`/meetings/${id}/start`, { method: "POST" });
}

export function endMeeting(id: string) {
  return apiRequest<Meeting>(`/meetings/${id}/end`, { method: "POST" });
}

export function joinMeeting(id: string, name?: string) {
  return apiRequest<JoinMeetingResult>(`/meetings/${id}/join`, {
    method: "POST",
    body: { name },
  });
}

export function leaveMeeting(id: string) {
  return apiRequest<MeetingParticipant>(`/meetings/${id}/leave`, { method: "POST" });
}

export function setScreenShare(id: string, isScreenSharing: boolean) {
  return apiRequest<MeetingParticipant>(`/meetings/${id}/screen-share`, {
    method: "POST",
    body: { isScreenSharing },
  });
}

export function getMeetingToken(id: string) {
  return apiRequest<MeetingTokenResult>(`/meetings/${id}/token`);
}

// Notifications
export function getNotifications() {
  return apiRequest<Array<{ id: string; title: string; body: string; read: boolean }>>("/notifications");
}

// AI
export function summarize(prompt: string) {
  return apiRequest<{ result: string; model: string }>("/ai/summarize", {
    method: "POST",
    body: { prompt },
  });
}
