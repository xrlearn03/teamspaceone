import { fetch } from "@tauri-apps/plugin-http";

const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ??
  "http://localhost:3000";
const TOKEN_KEY = "teamspace-one:accessToken";
const REFRESH_TOKEN_KEY = "teamspace-one:refreshToken";

let refreshPromise: Promise<string | null> | null = null;
let activeOrganisationId: string | null = null;

export function setActiveOrganisation(organisationId: string | null): void {
  activeOrganisationId = organisationId;
  if (organisationId) {
    localStorage.setItem("teamspace-one:organisationId", organisationId);
  } else {
    localStorage.removeItem("teamspace-one:organisationId");
  }
}

export function getActiveOrganisation(): string | null {
  if (activeOrganisationId) return activeOrganisationId;
  return localStorage.getItem("teamspace-one:organisationId");
}

export async function setAccessToken(token: string): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  return localStorage.getItem(TOKEN_KEY);
}

export async function clearAccessToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function storeTokens(tokens: TokenPair): Promise<void> {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;
    const response = await fetch(`${GATEWAY_URL}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      await clearAccessToken();
      return null;
    }
    const tokens = await response.json() as TokenPair;
    await storeTokens(tokens);
    return tokens.accessToken;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
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
  retryAfterRefresh = true,
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
    if (retryAfterRefresh && !["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"].includes(path)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return apiRequest<T>(path, options, false);
    }
    await clearAccessToken();
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed with status ${response.status}`;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (typeof body.message === "string") {
        message = body.message;
      } else if (Array.isArray(body.message)) {
        message = body.message.join(", ");
      }
    } catch {
      if (text) message = text;
    }
    throw new ApiError(response.status, message);
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

export interface OrganisationRole {
  id: string;
  organisationId: string;
  name: string;
  permissions: string[];
  isDefault: boolean;
}

export interface Client {
  id: string;
  organisationId: string;
  clientOrganisationId?: string | null;
  name: string;
  email?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  organisationId: string;
  email: string;
  roleId: string;
  status: string;
  expiresAt: string;
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

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  parentMessageId?: string | null;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: MessageAttachment[];
  reactions?: MessageReaction[];
  _count?: { replies: number };
  /** Set client-side for messages queued while offline. */
  pending?: boolean;
}

export interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

export interface Project {
  id: string;
  organisationId: string;
  workspaceId?: string | null;
  clientId?: string | null;
  name: string;
  description?: string | null;
  ownerId: string;
  status: string;
  startDate?: string | null;
  targetDate?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
}

export interface Task {
  id: string;
  organisationId: string;
  projectId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  status: string;
  priority: string;
  position: number;
  startDate?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileId: string;
  addedBy: string;
  createdAt: string;
}

export interface ProjectComment {
  id: string;
  organisationId: string;
  projectId: string;
  authorId: string;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAttachment {
  id: string;
  projectId: string;
  fileId: string;
  addedBy: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  organisationId: string;
  projectId?: string | null;
  resourceType: string;
  resourceId: string;
  requestedBy: string;
  requestedAt: string;
  status: string;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  message?: string | null;
}

export interface ProjectActivity {
  id: string;
  organisationId: string;
  projectId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: unknown;
  createdAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NotificationPreference {
  eventType: string;
  inApp: boolean;
  email: boolean;
  desktop: boolean;
  push: boolean;
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

export interface ExternalShare {
  id: string;
  fileId: string;
  token: string;
  expiresAt?: string | null;
  maxViews?: number | null;
  viewCount: number;
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
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
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
  isRecording?: boolean;
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

export interface MeetingMessage {
  id: string;
  meetingId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingReaction {
  id: string;
  meetingId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface MeetingRaiseHand {
  id: string;
  meetingId: string;
  userId: string;
  raised: boolean;
}

export interface MeetingRecordingState {
  isRecording: boolean;
  recordedBy?: string;
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
  await storeTokens(result.tokens);
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
  await storeTokens(result.tokens);
  return result;
}

export function getMe() {
  return apiRequest<UserDto>("/auth/me");
}

export function getUsers(ids?: string[]) {
  const params = new URLSearchParams();
  if (ids?.length) {
    for (const id of ids) params.append("ids", id);
  }
  const query = params.toString();
  return apiRequest<UserDto[]>(`/auth/users${query ? `?${query}` : ""}`);
}

export function updateProfile(body: { firstName?: string; lastName?: string }) {
  return apiRequest<UserDto>("/auth/me", { method: "PATCH", body });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<void>("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (refreshToken) {
    await apiRequest<void>("/auth/logout", { method: "POST", body: { refreshToken }, org: null }, false).catch(() => undefined);
  }
  await clearAccessToken();
}

// Organisations
export function getOrganisations() {
  return apiRequest<Organisation[]>("/organisations");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface CreateOrganisationResponse {
  organisation: Organisation;
  membership: unknown;
}

export async function createOrganisation(name: string, slug?: string): Promise<Organisation> {
  const res = await apiRequest<CreateOrganisationResponse>("/organisations", {
    method: "POST",
    body: { name, slug: slug ?? slugify(name) },
  });
  return res.organisation;
}

export function getWorkspaces(organisationId: string) {
  return apiRequest<Workspace[]>(`/organisations/${organisationId}/workspaces`);
}

export function getMembers(organisationId: string) {
  return apiRequest<OrganisationMember[]>(`/organisations/${organisationId}/members`);
}

export function getRoles(organisationId: string) {
  return apiRequest<OrganisationRole[]>(`/organisations/${organisationId}/roles`);
}

export async function createWorkspace(organisationId: string | null, name: string): Promise<Workspace> {
  let orgId = organisationId ?? getActiveOrganisation();
  if (!orgId) {
    const user = await getMe();
    const orgName = `${user.firstName || user.email || "Personal"}'s Organisation`;
    const suffix = Math.random().toString(36).slice(2, 10);
    const slug = `${slugify(orgName)}-${suffix}`;
    const org = await createOrganisation(orgName, slug);
    setActiveOrganisation(org.id);
    orgId = org.id;
  }
  return apiRequest<Workspace>(`/organisations/${orgId}/workspaces`, { method: "POST", body: { name } });
}

export function createInvitation(organisationId: string, email: string, roleId: string) {
  return apiRequest<Invitation>(`/organisations/${organisationId}/invitations`, { method: "POST", body: { email, roleId } });
}

export function getInvitations(organisationId: string) {
  return apiRequest<Invitation[]>(`/organisations/${organisationId}/invitations`);
}

export function revokeInvitation(organisationId: string, invitationId: string) {
  return apiRequest<void>(`/organisations/${organisationId}/invitations/${invitationId}`, { method: "DELETE" });
}

export function acceptInvitation(token: string) {
  return apiRequest<OrganisationMember>("/organisations/invitations/accept", { method: "POST", body: { token }, org: null });
}

export function getClients(organisationId: string) {
  return apiRequest<Client[]>(`/organisations/${organisationId}/clients`);
}

export function createClient(organisationId: string, body: { name: string; email?: string; clientOrganisationId?: string }) {
  return apiRequest<Client>(`/organisations/${organisationId}/clients`, { method: "POST", body });
}

export function updateClient(organisationId: string, clientId: string, body: { name?: string; email?: string | null; clientOrganisationId?: string | null }) {
  return apiRequest<Client>(`/organisations/${organisationId}/clients/${clientId}`, { method: "PATCH", body });
}

export function deleteClient(organisationId: string, clientId: string) {
  return apiRequest<void>(`/organisations/${organisationId}/clients/${clientId}`, { method: "DELETE" });
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

export function getThreadMessages(parentMessageId: string, cursor?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<MessagePage>(`/messages/${parentMessageId}/thread?${params.toString()}`);
}

export function sendMessage(channelId: string, content: string, attachmentIds?: string[], parentMessageId?: string) {
  return apiRequest<Message>("/messages", {
    method: "POST",
    body: { channelId, content, attachmentIds, parentMessageId },
  });
}

export function updateMessage(messageId: string, content: string) {
  return apiRequest<Message>(`/messages/${messageId}`, { method: "PATCH", body: { content } });
}

export function deleteMessage(messageId: string) {
  return apiRequest<Message>(`/messages/${messageId}`, { method: "DELETE" });
}

export function toggleMessageReaction(messageId: string, emoji: string) {
  return apiRequest<{ id: string; channelId: string; reactions: MessageReaction[] }>(
    `/messages/${messageId}/reactions`,
    { method: "POST", body: { emoji } },
  );
}

// Projects
export function getProjects() {
  return apiRequest<Project[]>("/projects");
}

export function getProject(projectId: string) {
  return apiRequest<Project>(`/projects/${projectId}`);
}

export function createProject(body: { name: string; description?: string; workspaceId?: string; clientId?: string; memberIds?: string[]; startDate?: string; targetDate?: string }) {
  return apiRequest<Project>("/projects", { method: "POST", body });
}

export function updateProject(projectId: string, body: { name?: string; description?: string | null; status?: string; clientId?: string | null; startDate?: string | null; targetDate?: string | null; memberIds?: string[] }) {
  return apiRequest<Project>(`/projects/${projectId}`, { method: "PATCH", body });
}

export function deleteProject(projectId: string) {
  return apiRequest<void>(`/projects/${projectId}`, { method: "DELETE" });
}

export function getTasks(projectId: string) {
  return apiRequest<Task[]>(`/projects/${projectId}/tasks`);
}

export function createTask(body: { projectId: string; title: string; description?: string; assigneeId?: string; startDate?: string; dueDate?: string; status?: string; priority?: string; position?: number }) {
  return apiRequest<Task>("/tasks", { method: "POST", body });
}

export function updateTask(taskId: string, body: { status?: string; title?: string; description?: string | null; assigneeId?: string | null; startDate?: string | null; dueDate?: string | null; priority?: string; position?: number }) {
  return apiRequest<Task>(`/tasks/${taskId}`, { method: "PATCH", body });
}

export function deleteTask(taskId: string) {
  return apiRequest<void>(`/tasks/${taskId}`, { method: "DELETE" });
}

export function getTaskAttachments(taskId: string) {
  return apiRequest<TaskAttachment[]>(`/tasks/${taskId}/attachments`);
}

export function addTaskAttachment(taskId: string, fileId: string) {
  return apiRequest<TaskAttachment>(`/tasks/${taskId}/attachments`, { method: "POST", body: { fileId } });
}

export function removeTaskAttachment(taskId: string, fileId: string) {
  return apiRequest<void>(`/tasks/${taskId}/attachments/${fileId}`, { method: "DELETE" });
}

export function getProjectComments(projectId: string, cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  return apiRequest<CursorPage<ProjectComment>>(`/projects/${projectId}/comments?${params.toString()}`);
}

export function createProjectComment(projectId: string, content: string) {
  return apiRequest<ProjectComment>(`/projects/${projectId}/comments`, { method: "POST", body: { content } });
}

export function updateProjectComment(commentId: string, content: string) {
  return apiRequest<ProjectComment>(`/project-comments/${commentId}`, { method: "PATCH", body: { content } });
}

export function deleteProjectComment(commentId: string) {
  return apiRequest<ProjectComment>(`/project-comments/${commentId}`, { method: "DELETE" });
}

export function getProjectAttachments(projectId: string) {
  return apiRequest<ProjectAttachment[]>(`/projects/${projectId}/attachments`);
}

export function addProjectAttachment(projectId: string, fileId: string) {
  return apiRequest<ProjectAttachment>(`/projects/${projectId}/attachments`, { method: "POST", body: { fileId } });
}

export function removeProjectAttachment(projectId: string, fileId: string) {
  return apiRequest<void>(`/projects/${projectId}/attachments/${fileId}`, { method: "DELETE" });
}

export function getApprovals(projectId?: string, status?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (status) params.set("status", status);
  return apiRequest<Approval[]>(`/approvals?${params.toString()}`);
}

export function createApproval(body: { projectId?: string; resourceType: "task" | "file" | "deliverable"; resourceId: string; message?: string }) {
  return apiRequest<Approval>("/approvals", { method: "POST", body });
}

export function resolveApproval(approvalId: string, status: "approved" | "rejected", message?: string) {
  return apiRequest<Approval>(`/approvals/${approvalId}`, { method: "PATCH", body: { status, message } });
}

export function getProjectActivity(projectId: string, cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  return apiRequest<CursorPage<ProjectActivity>>(`/projects/${projectId}/activity?${params.toString()}`);
}

// Files
export function getFiles() {
  return apiRequest<FileRecord[]>("/files");
}

export function getFile(fileId: string) {
  return apiRequest<FileRecord>(`/files/${fileId}`);
}

export function getExternalShares(fileId: string) {
  return apiRequest<ExternalShare[]>(`/files/${fileId}/shares`);
}

export function createExternalShare(fileId: string, body: { expiresAt?: string; maxViews?: number }) {
  return apiRequest<ExternalShare>(`/files/${fileId}/shares`, { method: "POST", body });
}

export function revokeExternalShare(shareId: string) {
  return apiRequest<void>(`/files/shares/${shareId}`, { method: "DELETE" });
}

export function deleteFile(fileId: string) {
  return apiRequest<void>(`/files/${fileId}`, { method: "DELETE" });
}

export function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<FileRecord>("/files/upload", {
    method: "POST",
    body: form,
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const org = getActiveOrganisation();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (org) headers["x-organisation-id"] = org;
  return headers;
}

export async function downloadFile(fileId: string): Promise<Blob> {
  const response = await fetch(`${GATEWAY_URL}/files/${fileId}/download?stream=true`, {
    method: "GET",
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Download error ${response.status}: ${text}`);
  }
  return response.blob();
}

export async function fetchFilePreview(fileId: string, type: "thumbnail" | "preview"): Promise<Blob> {
  const response = await fetch(`${GATEWAY_URL}/files/${fileId}/preview?type=${type}`, {
    method: "GET",
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Preview error ${response.status}: ${text}`);
  }
  return response.blob();
}

// Search
export interface SearchFilters {
  types?: string[];
  workspaceId?: string;
  authorId?: string;
  from?: string;
  to?: string;
}

export function search(query: string, filters?: SearchFilters) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (filters?.types) {
    for (const f of filters.types) params.append("type", f);
  }
  if (filters?.workspaceId) params.set("workspaceId", filters.workspaceId);
  if (filters?.authorId) params.set("authorId", filters.authorId);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  return apiRequest<SearchResult[]>(`/search?${params.toString()}`);
}

// Meetings
export function getMeetings() {
  return apiRequest<Meeting[]>("/meetings");
}

export function getMeeting(id: string) {
  return apiRequest<Meeting>(`/meetings/${id}`);
}

export function createMeeting(
  title: string,
  description?: string,
  workspaceId?: string,
  scheduledAt?: string,
) {
  return apiRequest<Meeting>("/meetings", {
    method: "POST",
    body: { title, description, workspaceId, scheduledAt },
  });
}

export function createVoiceRoom(title: string, workspaceId?: string) {
  return apiRequest<Meeting>("/meetings/voice-rooms", { method: "POST", body: { title, workspaceId } });
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

export function getMeetingToken(id: string, name?: string) {
  const query = name ? `?name=${encodeURIComponent(name)}` : "";
  return apiRequest<MeetingTokenResult>(`/meetings/${id}/token${query}`);
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

export function deleteEndedMeetings(workspaceId?: string) {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  return apiRequest<{ deleted: number }>(`/meetings/ended${query}`, { method: "DELETE" });
}

export function getMeetingMessages(id: string, cursor?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<{ items: MeetingMessage[]; nextCursor: string | null }>(`/meetings/${id}/messages?${params.toString()}`);
}

export function createMeetingMessage(id: string, content: string) {
  return apiRequest<MeetingMessage>(`/meetings/${id}/messages`, { method: "POST", body: { content } });
}

export function getMeetingReactions(id: string) {
  return apiRequest<MeetingReaction[]>(`/meetings/${id}/reactions`);
}

export function createMeetingReaction(id: string, emoji: string) {
  return apiRequest<MeetingReaction>(`/meetings/${id}/reactions`, { method: "POST", body: { emoji } });
}

export function getMeetingRaiseHands(id: string) {
  return apiRequest<MeetingRaiseHand[]>(`/meetings/${id}/raise-hands`);
}

export function updateMeetingRaiseHand(id: string, raised: boolean) {
  return apiRequest<MeetingRaiseHand>(`/meetings/${id}/raise-hand`, { method: "POST", body: { raised } });
}

export function setMeetingRecording(id: string, recording: boolean) {
  return apiRequest<Meeting>(`/meetings/${id}/recording`, { method: "POST", body: { recording } });
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

export function getNotificationPreference(eventType: string) {
  return apiRequest<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(eventType)}`);
}

export function setNotificationPreference(eventType: string, body: Partial<Pick<NotificationPreference, "inApp" | "email" | "desktop" | "push">>) {
  return apiRequest<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(eventType)}`, { method: "POST", body });
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

export interface DailyDigestResult {
  sections: { title: string; items: string[] }[];
  model: string;
  raw?: string;
}

export function dailyDigest(workspaceId?: string, hours?: number) {
  return apiRequest<DailyDigestResult>("/ai/daily-digest", {
    method: "POST",
    body: { workspaceId, hours },
  });
}

export interface AIPendingAction {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
}

export function getPendingAIActions(workspaceId?: string, limit?: number, cursor?: string) {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (limit) params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return apiRequest<AIPendingAction[]>(`/ai/actions/pending${query ? `?${query}` : ""}`);
}

export function confirmAIAction(id: string, edits?: Record<string, unknown>) {
  return apiRequest<AIPendingAction>(`/ai/actions/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: { edits },
  });
}

export function declineAIAction(id: string) {
  return apiRequest<AIPendingAction>(`/ai/actions/${encodeURIComponent(id)}/decline`, { method: "POST" });
}
