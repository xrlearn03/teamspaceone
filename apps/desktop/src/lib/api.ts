import { fetch } from "@tauri-apps/plugin-http";

const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ??
  "http://localhost:3000";
const TOKEN_KEY = "reactify:accessToken";

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
  localStorage.setItem(TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  return localStorage.getItem(TOKEN_KEY);
}

export async function clearAccessToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  org?: string | null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
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

export interface UserDto {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  active: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  organisationId: string;
  name: string;
  createdAt: string;
}

export interface OrganisationMember {
  id: string;
  userId: string;
  organisationId: string;
  role: { id: string; name: string };
  createdAt: string;
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

export interface Channel {
  id: string;
  organisationId: string;
  workspaceId?: string | null;
  name: string;
  type: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  members: ChannelMember[];
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  fileId: string;
  createdAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: MessageAttachment[];
}

export interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}

export interface Project {
  id: string;
  organisationId: string;
  workspaceId?: string | null;
  name: string;
  description?: string | null;
  ownerId: string;
  status: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  status: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  organisationId: string;
  userId: string;
  actorId?: string | null;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

export interface FileRecord {
  id: string;
  organisationId: string;
  workspaceId?: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  url?: string | null;
  downloadUrl?: string | null;
  storageKey?: string | null;
  createdAt: string;
}

export interface SearchResult {
  id: string;
  resourceType: string;
  resourceId: string;
  title?: string | null;
  content: string;
  metadata?: unknown;
  organisationId: string;
  workspaceId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  roomName: string;
  title: string;
  description?: string | null;
  status: string;
  type: string;
  createdBy: string;
  scheduledAt?: string | null;
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

// Auth
export async function register(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
) {
  const result = await apiRequest<{ user: UserDto; tokens: TokenPair }>(
    "/auth/register",
    {
      method: "POST",
      body: { email, password, firstName, lastName },
    },
  );
  await setAccessToken(result.tokens.accessToken);
  return result;
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ user: UserDto; tokens: TokenPair }>(
    "/auth/login",
    {
      method: "POST",
      body: { email, password },
    },
  );
  await setAccessToken(result.tokens.accessToken);
  return result;
}

export function getMe() {
  return apiRequest<UserDto>("/auth/me");
}

// Organisations
export function getOrganisations() {
  return apiRequest<Organisation[]>("/organisations");
}

export function createOrganisation(name: string) {
  return apiRequest<Organisation>("/organisations", {
    method: "POST",
    body: { name, slug: name.toLowerCase().replace(/\s+/g, "-") },
  });
}

export function getWorkspaces(organisationId: string) {
  return apiRequest<Workspace[]>(`/organisations/${organisationId}/workspaces`);
}

export function getMembers(organisationId: string) {
  return apiRequest<OrganisationMember[]>(`/organisations/${organisationId}/members`);
}

// Messaging
export function getChannels() {
  return apiRequest<Channel[]>("/channels");
}

export function createChannel(name: string, workspaceId?: string, type = "public", memberIds?: string[]) {
  return apiRequest<Channel>("/channels", {
    method: "POST",
    body: { name, workspaceId, type, memberIds },
  });
}

export function createDirectChannel(memberIds: string[]) {
  return apiRequest<Channel>("/channels/direct", { method: "POST", body: { memberIds } });
}

export function updateChannel(channelId: string, body: { name?: string; type?: "public" | "private" }) {
  return apiRequest<Channel>(`/channels/${channelId}`, { method: "PATCH", body });
}

export function replaceChannelMembers(channelId: string, memberIds: string[]) {
  return apiRequest<Channel>(`/channels/${channelId}/members`, { method: "PUT", body: { memberIds } });
}

export function deleteChannel(channelId: string) {
  return apiRequest<void>(`/channels/${channelId}`, { method: "DELETE" });
}

export function getMessages(channelId: string, cursor?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<MessagePage>(`/channels/${channelId}/messages?${params.toString()}`);
}

export function sendMessage(channelId: string, content: string, attachmentIds?: string[]) {
  return apiRequest<Message>("/messages", {
    method: "POST",
    body: { channelId, content, attachmentIds },
  });
}

export function updateMessage(messageId: string, content: string) {
  return apiRequest<Message>(`/messages/${messageId}`, { method: "PATCH", body: { content } });
}

export function deleteMessage(messageId: string) {
  return apiRequest<Message>(`/messages/${messageId}`, { method: "DELETE" });
}

// Projects
export function getProjects() {
  return apiRequest<Project[]>("/projects");
}

export function createProject(name: string, description?: string, workspaceId?: string) {
  return apiRequest<Project>("/projects", {
    method: "POST",
    body: { name, description, workspaceId },
  });
}

export function getTasks(projectId: string) {
  return apiRequest<Task[]>(`/projects/${projectId}/tasks`);
}

export function createTask(
  projectId: string,
  title: string,
  description?: string,
  assigneeId?: string,
  dueDate?: string,
) {
  return apiRequest<Task>("/tasks", {
    method: "POST",
    body: { projectId, title, description, assigneeId, dueDate },
  });
}

export function updateTask(
  taskId: string,
  body: { status?: string; title?: string; assigneeId?: string },
) {
  return apiRequest<Task>(`/tasks/${taskId}`, {
    method: "PUT",
    body,
  });
}

// Files
export function getFiles() {
  return apiRequest<FileRecord[]>("/files");
}

export function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<FileRecord>("/files/upload", {
    method: "POST",
    body: form,
  });
}

// Search
export function search(query: string, filters?: string[]) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (filters) {
    for (const f of filters) params.append("type", f);
  }
  return apiRequest<SearchResult[]>(`/search?${params.toString()}`);
}

// Meetings
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
export function getNotifications(unreadOnly = false, limit = 50) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("unread", "true");
  params.set("limit", String(limit));
  return apiRequest<Notification[]>(`/notifications?${params.toString()}`);
}

export function getUnreadCount() {
  return apiRequest<{ count: number }>("/notifications/count/unread");
}

export function markNotificationRead(id: string) {
  return apiRequest<{ updated: number }>(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead() {
  return apiRequest<{ updated: number }>("/notifications/read-all", {
    method: "PATCH",
  });
}

// AI
export function summarize(prompt: string, sourceText?: string) {
  return apiRequest<{ result: string; model: string }>("/ai/summarize", {
    method: "POST",
    body: { prompt, sourceText },
  });
}

export function askAI(question: string, workspaceId?: string, resourceTypes?: string[]) {
  return apiRequest<{ answer: string; sources: { resourceType: string; resourceId: string; title: string; text: string }[] }>(
    "/ai/ask",
    {
      method: "POST",
      body: { question, workspaceId, resourceTypes },
    },
  );
}
