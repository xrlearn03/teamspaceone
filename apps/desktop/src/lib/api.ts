import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { getCache, setCache, deleteCache } from "./desktop";

const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ??
  "http://localhost:3000";
const TOKEN_KEY = "teamspace-one:accessToken";
const REFRESH_TOKEN_KEY = "teamspace-one:refreshToken";
const KEYCHAIN_SERVICE = "teamspace-one";
const TOKEN_ORG = "__auth__";
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// The webview is served from http://localhost:<random port> in packaged
// builds, so localStorage does not survive app restarts. Auth tokens live
// in the OS keychain instead, with localStorage as a fallback for plain
// browser dev. An in-memory mirror avoids a keychain read per request.
let accessTokenCache: string | null | undefined;
let refreshTokenCache: string | null | undefined;

let refreshPromise: Promise<string | null> | null = null;
let activeOrganisationId: string | null = null;
let sessionClearedCallback: (() => void) | null = null;

export function setOnSessionCleared(callback: (() => void) | null): void {
  sessionClearedCallback = callback;
}

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

async function readToken(key: string): Promise<string | null> {
  if (!isTauri) return localStorage.getItem(key);
  // SQLite persists in the app data dir regardless of the webview's
  // random localhost port, so it is the reliable store. The keychain and
  // localStorage entries are fallbacks/migration paths.
  try {
    const cached = await getCache(key, TOKEN_ORG);
    if (typeof cached === "string" && cached) return cached;
  } catch {
    // fall through
  }
  try {
    const value = await invoke<string | null>("get_secure_token", {
      service: KEYCHAIN_SERVICE,
      account: key,
    });
    if (value) return value;
  } catch {
    // fall through
  }
  return localStorage.getItem(key);
}

async function writeToken(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
  if (!isTauri) return;
  try {
    await setCache(key, TOKEN_ORG, value);
  } catch {
    // sqlite unavailable; keychain/localStorage still cover it
  }
  try {
    await invoke("store_secure_token", {
      service: KEYCHAIN_SERVICE,
      account: key,
      token: value,
    });
  } catch {
    // keychain write failed; sqlite copy already persisted
  }
}

async function deleteToken(key: string): Promise<void> {
  localStorage.removeItem(key);
  if (!isTauri) return;
  try {
    await deleteCache(key, TOKEN_ORG);
  } catch {
    // already gone
  }
  try {
    await invoke("delete_secure_token", {
      service: KEYCHAIN_SERVICE,
      account: key,
    });
  } catch {
    // already gone
  }
}

export async function setAccessToken(token: string): Promise<void> {
  accessTokenCache = token;
  await writeToken(TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  if (accessTokenCache === undefined) {
    accessTokenCache = await readToken(TOKEN_KEY);
  }
  return accessTokenCache;
}

export async function clearAccessToken(): Promise<void> {
  accessTokenCache = null;
  refreshTokenCache = null;
  await deleteToken(TOKEN_KEY);
  await deleteToken(REFRESH_TOKEN_KEY);
  sessionClearedCallback?.();
}

async function getRefreshToken(): Promise<string | null> {
  if (refreshTokenCache === undefined) {
    refreshTokenCache = await readToken(REFRESH_TOKEN_KEY);
  }
  return refreshTokenCache;
}

async function storeTokens(tokens: TokenPair): Promise<void> {
  accessTokenCache = tokens.accessToken;
  refreshTokenCache = tokens.refreshToken;
  await writeToken(TOKEN_KEY, tokens.accessToken);
  await writeToken(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 15_000;

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
  retryAfterRefresh = true,
  rateLimitRetries = MAX_RATE_LIMIT_RETRIES,
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
  if (response.status === 429) {
    if (rateLimitRetries > 0) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        : 1000 * (MAX_RATE_LIMIT_RETRIES - rateLimitRetries + 1);
      await sleep(delay);
      return apiRequest<T>(path, options, retryAfterRefresh, rateLimitRetries - 1);
    }
    throw new ApiError(429, "Too many requests — please try again in a moment.");
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
  avatarFileId?: string | null;
  active: boolean;
  emailVerified: boolean;
  mustChangePassword?: boolean;
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

export interface Permission {
  id: string;
  module: string;
  resource: string;
  action: string;
  description?: string | null;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
  permission: Permission;
}

export type RoleCategory =
  | "administrative"
  | "managerial"
  | "employee"
  | "member"
  | "external"
  | "candidate"
  | "guest";

/** Categories assignable through the administrative role-management UI. */
export const ADMIN_MANAGED_ROLE_CATEGORIES: RoleCategory[] = ["administrative", "managerial"];

export interface OrganisationRole {
  id: string;
  organisationId: string;
  name: string;
  description?: string | null;
  roleCategory: RoleCategory;
  isSystem?: boolean;
  isDefault: boolean;
  rolePermissions: RolePermission[];
  roleScopes: UserDataScope[];
  createdAt: string;
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
  role: { id: string; name: string; roleCategory?: RoleCategory };
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

export interface MessageMention {
  messageId: string;
  userId: string;
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
  mentions?: MessageMention[];
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
  sourceMessageId?: string | null;
  sourceChannelId?: string | null;
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

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
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
  checksumSha256?: string | null;
  metadata?: Record<string, unknown> | null;
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

export interface MeetingSfuTokenResult {
  token: string;
  roomId: string;
  userId: string;
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

export function updateProfile(body: { firstName?: string; lastName?: string; avatarFileId?: string | null }) {
  return apiRequest<UserDto>("/auth/me", { method: "PATCH", body });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<void>("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
}

export function requestPasswordReset(email: string) {
  return apiRequest<{ requested: boolean }>("/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword(email: string, code: string, newPassword: string) {
  return apiRequest<{ reset: boolean }>("/auth/reset-password", { method: "POST", body: { email, code, newPassword } });
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
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

export interface UserDataScope {
  module: string;
  scope: "own" | "assigned" | "team" | "department" | "organisation";
  scopeValue?: string | null;
}

/** Authorisation context for the current user in the active organisation. */
export interface UserContext {
  id: string;
  organisationId: string;
  permissions: string[];
  dataScopes: UserDataScope[];
  isSuperAdmin?: boolean;
}

export function getMyContext(organisationId: string) {
  return apiRequest<UserContext>(`/organisations/${organisationId}/me/context`);
}

export function getRoles(organisationId: string) {
  return apiRequest<OrganisationRole[]>(`/organisations/${organisationId}/roles`);
}

export function getPermissions(organisationId: string) {
  return apiRequest<Permission[]>(`/organisations/${organisationId}/permissions`);
}

export function createRole(organisationId: string, body: { name: string; description?: string; roleCategory: RoleCategory; permissionIds: string[]; scopes?: UserDataScope[] }) {
  return apiRequest<OrganisationRole>(`/organisations/${organisationId}/roles`, { method: "POST", body });
}

export function updateRole(organisationId: string, roleId: string, body: { name?: string; description?: string; roleCategory?: RoleCategory; permissionIds?: string[]; scopes?: UserDataScope[] }) {
  return apiRequest<OrganisationRole>(`/organisations/${organisationId}/roles/${roleId}`, { method: "PATCH", body });
}

export function deleteRole(organisationId: string, roleId: string) {
  return apiRequest<void>(`/organisations/${organisationId}/roles/${roleId}`, { method: "DELETE" });
}

export function updateMemberRole(organisationId: string, membershipId: string, roleId: string) {
  return apiRequest<void>(`/organisations/${organisationId}/members/${membershipId}/role`, { method: "PATCH", body: { roleId } });
}

export function inviteMember(
  organisationId: string,
  body: { email: string; roleId: string; firstName?: string; lastName?: string },
) {
  return apiRequest<{ membership: OrganisationMember; accountCreated: boolean }>(
    `/organisations/${organisationId}/members/invite`,
    { method: "POST", body },
  );
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

export function resendInvitation(organisationId: string, invitationId: string) {
  return apiRequest<void>(`/organisations/${organisationId}/invitations/${invitationId}/resend`, { method: "POST" });
}

export function removeMember(organisationId: string, membershipId: string) {
  return apiRequest<void>(`/organisations/${organisationId}/members/${membershipId}`, { method: "DELETE" });
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

interface PresignUploadResult {
  id: string;
  uploadUrl: string;
  storageKey: string;
  uploadHeaders?: Record<string, string>;
}

async function sha256Hex(file: File): Promise<string | undefined> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

export interface UploadResource {
  resourceType: "channel" | "project" | "task" | "meeting";
  resourceId: string;
  workspaceId?: string;
}

export async function uploadFile(file: File, resource?: UploadResource) {
  const mimeType = file.type || "application/octet-stream";
  const sha256 = await sha256Hex(file);

  try {
    const presign = await apiRequest<PresignUploadResult>("/files/presign-upload", {
      method: "POST",
      body: {
        fileName: file.name,
        mimeType,
        size: file.size,
        category: "attachment",
        resourceType: resource?.resourceType,
        resourceId: resource?.resourceId,
        workspaceId: resource?.workspaceId,
        sha256,
      },
    });

    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType, ...presign.uploadHeaders },
      body: file,
    });
    if (!put.ok) {
      throw new ApiError(put.status, `Upload failed with status ${put.status}`);
    }

    return await apiRequest<FileRecord>(`/files/${presign.id}/complete`, {
      method: "POST",
      body: { sha256 },
    });
  } catch (err) {
    // Older deployments may not expose the presign flow; fall back to multipart.
    if (!(err instanceof ApiError && err.status === 404)) throw err;
    const form = new FormData();
    form.append("file", file);
    return apiRequest<FileRecord>("/files/upload", { method: "POST", body: form });
  }
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

export interface CalendarEvent {
  id: string;
  type: "meeting";
  sourceId: string;
  title: string;
  description?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  meetingType: string;
  workspaceId?: string | null;
  participantCount: number;
}

// Meetings
export function getMeetings() {
  return apiRequest<Meeting[]>("/meetings");
}

export function getCalendarEvents(range?: { from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const qs = params.toString();
  return apiRequest<CalendarEvent[]>(`/meetings/calendar/events${qs ? `?${qs}` : ""}`);
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

export function getSfuToken(id: string) {
  return apiRequest<MeetingSfuTokenResult>(`/meetings/${id}/sfu-token`, { method: "POST" });
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

// ---------------------------------------------------------------------------
// HRMS (Phase 4)
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  organisationId: string;
  userId: string;
  firstName: string;
  lastName: string;
  workEmail?: string | null;
  phone?: string | null;
  avatarFileId?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  managerEmployeeId?: string | null;
  joiningDate?: string | null;
  employmentType: string;
  status: string;
  employeeNumber?: string | null;
  departmentName?: string | null;
  designationName?: string | null;
  department?: { id: string; name: string } | null;
  designation?: { id: string; title?: string; name?: string } | null;
  manager?: { id: string; firstName?: string; lastName?: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  organisationId: string;
  name: string;
  description?: string | null;
  parentDepartmentId?: string | null;
  headEmployeeId?: string | null;
  memberCount?: number;
  createdAt?: string;
}

export interface Designation {
  id: string;
  organisationId: string;
  title: string;
  name?: string;
  level?: string | null;
  departmentId?: string | null;
  createdAt?: string;
}

export interface AttendanceRecord {
  id: string;
  organisationId?: string;
  employeeId: string;
  employeeName?: string | null;
  date: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes?: number | null;
  status: string;
  presenceStatus?: string | null;
  createdAt?: string;
}

export interface AttendanceCorrection {
  id: string;
  attendanceId?: string;
  attendanceRecordId?: string;
  employeeId: string;
  employeeName?: string | null;
  date?: string | null;
  requestedCheckInAt?: string | null;
  requestedCheckOutAt?: string | null;
  reason?: string | null;
  status: string;
  reviewerNote?: string | null;
  createdAt?: string;
}

export interface LeaveType {
  id: string;
  organisationId?: string;
  name: string;
  code?: string | null;
  paid?: boolean;
  annualEntitlement?: number | null;
  createdAt?: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName?: string | null;
  year?: number;
  entitled: number;
  used: number;
  remaining: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  leaveTypeId: string;
  leaveTypeName?: string | null;
  startDate: string;
  endDate: string;
  days?: number | null;
  reason?: string | null;
  status: string;
  reviewerNote?: string | null;
  createdAt?: string;
}

export interface Holiday {
  id: string;
  organisationId?: string;
  name: string;
  date: string;
  description?: string | null;
}

export interface PayrollPeriod {
  id: string;
  organisationId?: string;
  name?: string | null;
  startDate: string;
  endDate: string;
  status: string;
}

export interface Payslip {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  payrollPeriodId: string;
  periodName?: string | null;
  gross?: number | null;
  net?: number | null;
  currency?: string | null;
  status: string;
  createdAt?: string;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  fileId: string;
  name?: string | null;
  category?: string | null;
  uploadedBy?: string | null;
  createdAt?: string;
}

export interface HrmsOverview {
  totalEmployees: number;
  byDepartment: { name: string; count: number }[];
  pendingLeaveRequests: number;
  pendingCorrections: number;
  presentToday: number;
}

export interface OrgChartNode {
  id: string;
  name: string;
  designation?: string | null;
  department?: string | null;
  children: OrgChartNode[];
}

export function getHrmsOverview() {
  return apiRequest<HrmsOverview>("/hrms/overview");
}

export interface HrmsCalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  type: string; // leave | holiday | custom
  startAt: string;
  endAt: string;
  allDay: boolean;
  visibility: string;
  employeeId?: string | null;
}

export interface HrmsCalendar {
  events: HrmsCalendarEvent[];
  holidays: HrmsCalendarEvent[];
}

export function getHrmsCalendar(range?: { from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const qs = params.toString();
  return apiRequest<HrmsCalendar>(`/hrms/calendar${qs ? `?${qs}` : ""}`);
}

export interface EmployeeListParams {
  departmentId?: string;
  status?: string;
  search?: string;
}

export function getEmployees(params?: EmployeeListParams) {
  const query = new URLSearchParams();
  if (params?.departmentId) query.set("departmentId", params.departmentId);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiRequest<Employee[]>(`/hrms/employees${qs ? `?${qs}` : ""}`);
}

export function getMyEmployee() {
  return apiRequest<Employee>("/hrms/employees/me");
}

export function getEmployee(id: string) {
  return apiRequest<Employee>(`/hrms/employees/${encodeURIComponent(id)}`);
}

export function createEmployee(body: {
  userId: string;
  membershipId?: string;
  firstName: string;
  lastName: string;
  workEmail?: string;
  phone?: string;
  departmentId?: string;
  designationId?: string;
  managerEmployeeId?: string;
  joiningDate?: string;
  employmentType?: string;
  employeeNumber?: string;
}) {
  return apiRequest<Employee>("/hrms/employees", { method: "POST", body });
}

export function updateEmployee(
  id: string,
  body: Partial<{
    firstName: string;
    lastName: string;
    workEmail: string | null;
    phone: string | null;
    departmentId: string | null;
    designationId: string | null;
    managerEmployeeId: string | null;
    joiningDate: string | null;
    employmentType: string;
    status: string;
    employeeNumber: string | null;
  }>,
) {
  return apiRequest<Employee>(`/hrms/employees/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function getDepartments() {
  return apiRequest<Department[]>("/hrms/departments");
}

export function createDepartment(body: { name: string; description?: string; parentDepartmentId?: string; headEmployeeId?: string }) {
  return apiRequest<Department>("/hrms/departments", { method: "POST", body });
}

export function updateDepartment(id: string, body: { name?: string; description?: string | null; parentDepartmentId?: string | null; headEmployeeId?: string | null }) {
  return apiRequest<Department>(`/hrms/departments/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function deleteDepartment(id: string) {
  return apiRequest<void>(`/hrms/departments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getDesignations() {
  return apiRequest<Designation[]>("/hrms/designations");
}

export function createDesignation(body: { title: string; level?: string; departmentId?: string }) {
  return apiRequest<Designation>("/hrms/designations", { method: "POST", body });
}

export function getOrgChart() {
  return apiRequest<OrgChartNode[]>("/hrms/org-chart");
}

export function attendanceCheckin() {
  return apiRequest<AttendanceRecord>("/hrms/attendance/checkin", { method: "POST" });
}

export function attendanceCheckout() {
  return apiRequest<AttendanceRecord>("/hrms/attendance/checkout", { method: "POST" });
}

export function attendancePresence(status: "lunch" | "tea_break" | "out_of_office" | null) {
  return apiRequest<AttendanceRecord>("/hrms/attendance/presence", {
    method: "POST",
    body: { status },
  });
}

export function getAttendance(params?: { employeeId?: string; from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.employeeId) query.set("employeeId", params.employeeId);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return apiRequest<AttendanceRecord[]>(`/hrms/attendance${qs ? `?${qs}` : ""}`);
}

export function requestAttendanceCorrection(body: {
  attendanceId: string;
  requestedCheckInAt?: string;
  requestedCheckOutAt?: string;
  reason?: string;
}) {
  return apiRequest<AttendanceCorrection>("/hrms/attendance/corrections", { method: "POST", body });
}

export function getAttendanceCorrections(params?: { status?: string }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiRequest<AttendanceCorrection[]>(`/hrms/attendance/corrections${qs ? `?${qs}` : ""}`);
}

export function reviewAttendanceCorrection(id: string, action: "approve" | "reject", note?: string) {
  return apiRequest<AttendanceCorrection>(
    `/hrms/attendance/corrections/${encodeURIComponent(id)}/${action}`,
    { method: "POST", body: note ? { note } : {} },
  );
}

export function getLeaveTypes() {
  return apiRequest<LeaveType[]>("/hrms/leave/types");
}

export function getLeaveBalances(employeeId?: string) {
  const qs = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  return apiRequest<LeaveBalance[]>(`/hrms/leave/balances${qs}`);
}

export function getLeaveRequests(params?: { status?: string; employeeId?: string; mine?: boolean }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.employeeId) query.set("employeeId", params.employeeId);
  if (params?.mine) query.set("mine", "true");
  const qs = query.toString();
  return apiRequest<LeaveRequest[]>(`/hrms/leave/requests${qs ? `?${qs}` : ""}`);
}

export function applyLeave(body: { leaveTypeId: string; startDate: string; endDate: string; reason?: string }) {
  return apiRequest<LeaveRequest>("/hrms/leave/requests", { method: "POST", body });
}

export function reviewLeaveRequest(id: string, action: "approve" | "reject" | "cancel", note?: string) {
  return apiRequest<LeaveRequest>(
    `/hrms/leave/requests/${encodeURIComponent(id)}/${action}`,
    { method: "POST", body: note ? { note } : {} },
  );
}

export function getHolidays() {
  return apiRequest<Holiday[]>("/hrms/holidays");
}

export function getPayrollPeriods() {
  return apiRequest<PayrollPeriod[]>("/hrms/payroll/periods");
}

export function getPayslips(params?: { employeeId?: string; payrollPeriodId?: string }) {
  const query = new URLSearchParams();
  if (params?.employeeId) query.set("employeeId", params.employeeId);
  if (params?.payrollPeriodId) query.set("payrollPeriodId", params.payrollPeriodId);
  const qs = query.toString();
  return apiRequest<Payslip[]>(`/hrms/payroll/payslips${qs ? `?${qs}` : ""}`);
}

export function getPayslip(id: string) {
  return apiRequest<Payslip>(`/hrms/payroll/payslips/${encodeURIComponent(id)}`);
}

export function getEmployeeDocuments(employeeId?: string) {
  const qs = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  return apiRequest<EmployeeDocument[]>(`/hrms/documents${qs}`);
}

export function uploadEmployeeDocument(body: { employeeId?: string; fileId: string; category?: string; name?: string }) {
  return apiRequest<EmployeeDocument>("/hrms/documents", { method: "POST", body });
}

export function deleteEmployeeDocument(id: string) {
  return apiRequest<void>(`/hrms/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Interview / recruitment
export interface JobOpening {
  id: string;
  organisationId: string;
  title: string;
  departmentId?: string | null;
  departmentName?: string | null;
  hiringManagerId?: string | null;
  recruiterId?: string | null;
  description?: string | null;
  requirements?: string | null;
  status: string;
  createdAt: string;
}

export interface CandidateApplication {
  id: string;
  candidateId: string;
  jobOpeningId: string;
  stage: string;
  jobOpening?: { id: string; title: string } | null;
  createdAt: string;
}

export interface Candidate {
  id: string;
  organisationId: string;
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  source?: string | null;
  status: string;
  resumeFileId?: string | null;
  applications?: CandidateApplication[];
  createdAt: string;
}

export interface InterviewSession {
  id: string;
  organisationId: string;
  candidateId: string;
  jobOpeningId?: string | null;
  interviewType: string;
  scheduledAt?: string | null;
  durationMin: number;
  status: string;
  candidate?: { id: string; name: string; email?: string } | null;
  jobOpening?: { id: string; title: string } | null;
  participants?: { id: string; userId: string; role: string }[];
  createdAt: string;
}

export interface InterviewOverview {
  openJobs: number;
  totalCandidates: number;
  candidatesByStage: Record<string, number>;
  interviewsToday: number;
  upcomingInterviews: number;
  pendingEvaluations: number;
}

export function getInterviewOverview() {
  return apiRequest<InterviewOverview>("/interview/overview");
}

export function getJobOpenings(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<JobOpening[]>(`/interview/jobs${qs}`);
}

export function createJobOpening(body: {
  title: string;
  departmentId?: string;
  departmentName?: string;
  hiringManagerId?: string;
  recruiterId?: string;
  description?: string;
  requirements?: string;
}) {
  return apiRequest<JobOpening>("/interview/jobs", { method: "POST", body });
}

export function updateJobOpening(id: string, body: Partial<{
  title: string;
  departmentId: string | null;
  hiringManagerId: string | null;
  recruiterId: string | null;
  description: string | null;
  requirements: string | null;
  status: string;
}>) {
  return apiRequest<JobOpening>(`/interview/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function getCandidates(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<Candidate[]>(`/interview/candidates${qs}`);
}

export function createCandidate(body: {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  source?: string;
  jobOpeningId?: string;
}) {
  return apiRequest<Candidate>("/interview/candidates", { method: "POST", body });
}

export function updateCandidate(id: string, body: { resumeFileId?: string | null }) {
  return apiRequest<Candidate>(`/interview/candidates/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function getHiringDecisions() {
  return apiRequest<HiringDecision[]>("/interview/decisions");
}

export function updateApplicationStage(applicationId: string, stage: string) {
  return apiRequest<CandidateApplication>(`/interview/applications/${encodeURIComponent(applicationId)}/stage`, {
    method: "PATCH",
    body: { stage },
  });
}

export function getInterviewSessions(upcoming?: boolean) {
  const qs = upcoming ? "?upcoming=true" : "";
  return apiRequest<InterviewSession[]>(`/interview/sessions${qs}`);
}

export function createInterviewSession(body: {
  candidateId: string;
  jobOpeningId?: string;
  interviewType?: string;
  scheduledAt?: string;
  durationMin?: number;
  participantIds?: string[];
}) {
  return apiRequest<InterviewSession>("/interview/sessions", { method: "POST", body });
}

export function getPendingEvaluations() {
  return apiRequest<unknown[]>("/interview/evaluations/pending");
}

export function submitInterviewEvaluation(sessionId: string, body: {
  technicalScore?: number;
  communicationScore?: number;
  problemSolvingScore?: number;
  cultureFitScore?: number;
  overallScore?: number;
  recommendation?: string;
  comments?: string;
}) {
  return apiRequest<unknown>(`/interview/sessions/${encodeURIComponent(sessionId)}/evaluations`, {
    method: "POST",
    body,
  });
}

// ─── Phase 6 — AI screening + AI interview ──────────────────────────────────

export interface ScreeningResult {
  id: string;
  applicationId: string;
  matchScore?: number | null;
  skillsFound: string[];
  missingRequirements: string[];
  summary: string;
  confidence: "low" | "medium" | "high" | (string & {});
  status: "ai_generated" | "reviewed";
  model: string;
  promptVersion: string;
}

export interface AiQuestion {
  category?: string | null;
  question: string;
  sortOrder: number;
}

export interface AiStartResult {
  session: InterviewSession;
  questions: AiQuestion[];
}

export interface AiAnswerResponse {
  done: boolean;
  next?: { question: string; sortOrder: number } | null;
}

export interface InterviewAnswer {
  question: string;
  answer: string | null;
  sortOrder: number;
}

export interface InterviewEvaluation {
  id: string;
  sessionId: string;
  technicalScore?: number;
  communicationScore?: number;
  problemSolvingScore?: number;
  cultureFitScore?: number;
  overallScore?: number;
  recommendation?: string;
  comments?: string;
  source?: string;
  status?: string;
  aiMetadata?: { suggestedFollowUps: string[]; model: string; promptVersion: string } | null;
  createdAt: string;
}

export interface HiringDecision {
  id: string;
  organisationId?: string;
  applicationId: string;
  decision: "offer" | "hire" | "reject" | "hold" | (string & {});
  rationale?: string | null;
  decidedBy?: string;
  createdAt: string;
  application?: {
    candidate?: { id: string; name: string } | null;
    jobOpening?: { id: string; title: string } | null;
  } | null;
}

export interface InterviewTemplateQuestion {
  id?: string;
  question: string;
  category?: string;
  sortOrder?: number;
}

export interface InterviewTemplate {
  id: string;
  organisationId: string;
  name: string;
  description?: string | null;
  config: {
    difficulty?: string;
    duration?: number;
    categories?: string[];
    [key: string]: unknown;
  };
  questions: InterviewTemplateQuestion[];
  createdAt: string;
  updatedAt: string;
}

export function runApplicationScreening(applicationId: string, body: { resumeText?: string } = {}) {
  return apiRequest<ScreeningResult>(`/interview/applications/${encodeURIComponent(applicationId)}/screen`, {
    method: "POST",
    body,
  });
}

export async function getApplicationScreening(applicationId: string): Promise<ScreeningResult | null> {
  try {
    return await apiRequest<ScreeningResult>(`/interview/applications/${encodeURIComponent(applicationId)}/screening`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function reviewApplicationScreening(applicationId: string) {
  return apiRequest<ScreeningResult>(`/interview/applications/${encodeURIComponent(applicationId)}/screening/review`, {
    method: "POST",
    body: {},
  });
}

export function startAiInterview(sessionId: string, body: { templateId?: string; config?: Record<string, unknown> } = {}) {
  return apiRequest<AiStartResult>(`/interview/sessions/${encodeURIComponent(sessionId)}/ai/start`, {
    method: "POST",
    body,
  });
}

export function submitAiAnswer(sessionId: string, body: { questionIndex: number; answer: string }) {
  return apiRequest<AiAnswerResponse>(`/interview/sessions/${encodeURIComponent(sessionId)}/ai/answer`, {
    method: "POST",
    body,
  });
}

export function getAiTranscript(sessionId: string) {
  return apiRequest<InterviewAnswer[]>(`/interview/sessions/${encodeURIComponent(sessionId)}/ai/transcript`);
}

export function evaluateAiInterview(sessionId: string) {
  return apiRequest<InterviewEvaluation>(`/interview/sessions/${encodeURIComponent(sessionId)}/ai/evaluate`, {
    method: "POST",
    body: {},
  });
}

export function getSessionEvaluations(sessionId: string) {
  return apiRequest<InterviewEvaluation[]>(`/interview/sessions/${encodeURIComponent(sessionId)}/evaluations`);
}

export function reviewEvaluation(evaluationId: string, body: {
  technicalScore?: number;
  communicationScore?: number;
  problemSolvingScore?: number;
  cultureFitScore?: number;
  overallScore?: number;
  recommendation?: string;
  comments?: string;
}) {
  return apiRequest<InterviewEvaluation>(`/interview/evaluations/${encodeURIComponent(evaluationId)}/review`, {
    method: "POST",
    body,
  });
}

export function makeHiringDecision(applicationId: string, body: { decision: "offer" | "hire" | "reject" | "hold"; rationale?: string }) {
  return apiRequest<HiringDecision>(`/interview/applications/${encodeURIComponent(applicationId)}/decision`, {
    method: "POST",
    body,
  });
}

export function getInterviewTemplates() {
  return apiRequest<InterviewTemplate[]>("/interview/templates");
}

export function createInterviewTemplate(body: Partial<InterviewTemplate>) {
  return apiRequest<InterviewTemplate>("/interview/templates", { method: "POST", body });
}

export function updateInterviewTemplate(id: string, body: Partial<InterviewTemplate>) {
  return apiRequest<InterviewTemplate>(`/interview/templates/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function deleteInterviewTemplate(id: string) {
  return apiRequest<void>(`/interview/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ─── Phase 7 — Advanced HRMS ────────────────────────────────────────────────

export interface OnboardingTemplateTask {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  assigneeRole?: string | null;
  dueDaysOffset?: number | null;
  sortOrder?: number | null;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  tasks: OnboardingTemplateTask[];
}

export interface OnboardingTask {
  id: string;
  title: string;
  category?: string | null;
  status: string;
  dueDate?: string | null;
  assigneeUserId?: string | null;
  completedAt?: string | null;
}

export interface OnboardingInstance {
  id: string;
  status: string;
  sourceType?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  startDate?: string | null;
  completedAt?: string | null;
  employeeId?: string | null;
  employee?: { id: string; firstName: string; lastName: string } | null;
  template?: { id: string; name: string } | null;
  tasks: OnboardingTask[];
}

export function getOnboardingTemplates() {
  return apiRequest<OnboardingTemplate[]>("/hrms/onboarding/templates");
}

export function createOnboardingTemplate(body: {
  name: string;
  description?: string;
  tasks: { title: string; description?: string; category?: string; dueDaysOffset?: number; sortOrder?: number }[];
}) {
  return apiRequest<OnboardingTemplate>("/hrms/onboarding/templates", { method: "POST", body });
}

export function updateOnboardingTemplate(
  id: string,
  body: Partial<{
    name: string;
    description: string | null;
    isActive: boolean;
    tasks: { title: string; description?: string; category?: string; dueDaysOffset?: number; sortOrder?: number }[];
  }>,
) {
  return apiRequest<OnboardingTemplate>(`/hrms/onboarding/templates/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function deleteOnboardingTemplate(id: string) {
  return apiRequest<void>(`/hrms/onboarding/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getOnboardingInstances(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<OnboardingInstance[]>(`/hrms/onboarding${qs}`);
}

export function getOnboardingInstance(id: string) {
  return apiRequest<OnboardingInstance>(`/hrms/onboarding/${encodeURIComponent(id)}`);
}

export function createOnboardingInstance(body: {
  employeeId?: string;
  candidateName?: string;
  candidateEmail?: string;
  templateId?: string;
  startDate?: string;
}) {
  return apiRequest<OnboardingInstance>("/hrms/onboarding", { method: "POST", body });
}

export function convertOnboardingInstance(
  id: string,
  body: {
    userId: string;
    firstName: string;
    lastName: string;
    workEmail?: string;
    phone?: string;
    departmentId?: string;
    designationId?: string;
    managerEmployeeId?: string;
    joiningDate?: string;
    employmentType?: string;
    employeeNumber?: string;
  },
) {
  return apiRequest<OnboardingInstance>(`/hrms/onboarding/${encodeURIComponent(id)}/convert`, { method: "POST", body });
}

export function setOnboardingTaskStatus(id: string, taskId: string, action: "complete" | "reopen") {
  return apiRequest<OnboardingInstance>(
    `/hrms/onboarding/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/${action}`,
    { method: "POST" },
  );
}

export function cancelOnboardingInstance(id: string) {
  return apiRequest<OnboardingInstance>(`/hrms/onboarding/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

// Offboarding

export interface OffboardingTask {
  id: string;
  title: string;
  category?: string | null;
  status: string;
  completedAt?: string | null;
}

export interface OffboardingCase {
  id: string;
  type: string;
  reason?: string | null;
  lastWorkingDate?: string | null;
  status: string;
  exitInterviewNotes?: string | null;
  settlementNotes?: string | null;
  initiatedBy?: string | null;
  completedAt?: string | null;
  employee: { id: string; firstName: string; lastName: string };
  tasks: OffboardingTask[];
}

export function getOffboardingCases() {
  return apiRequest<OffboardingCase[]>("/hrms/offboarding");
}

export function getOffboardingCase(id: string) {
  return apiRequest<OffboardingCase>(`/hrms/offboarding/${encodeURIComponent(id)}`);
}

export function createOffboardingCase(body: {
  employeeId: string;
  type?: string;
  reason?: string;
  lastWorkingDate?: string;
}) {
  return apiRequest<OffboardingCase>("/hrms/offboarding", { method: "POST", body });
}

export function updateOffboardingCase(
  id: string,
  body: Partial<{
    reason: string | null;
    lastWorkingDate: string | null;
    exitInterviewNotes: string | null;
    settlementNotes: string | null;
    status: string;
  }>,
) {
  return apiRequest<OffboardingCase>(`/hrms/offboarding/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function setOffboardingTaskStatus(id: string, taskId: string, action: "complete" | "reopen") {
  return apiRequest<OffboardingCase>(
    `/hrms/offboarding/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/${action}`,
    { method: "POST" },
  );
}

export function transitionOffboardingCase(id: string, action: "complete" | "cancel") {
  return apiRequest<OffboardingCase>(`/hrms/offboarding/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

// Performance

export interface ReviewCycle {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
}

export function getReviewCycles() {
  return apiRequest<ReviewCycle[]>("/hrms/performance/cycles");
}

export function createReviewCycle(body: { name: string; startDate?: string; endDate?: string }) {
  return apiRequest<ReviewCycle>("/hrms/performance/cycles", { method: "POST", body });
}

export function updateReviewCycle(
  id: string,
  body: Partial<{ name: string; startDate: string | null; endDate: string | null; status: string }>,
) {
  return apiRequest<ReviewCycle>(`/hrms/performance/cycles/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export interface PerformanceReview {
  id: string;
  status: string;
  overallRating?: number | null;
  ratings?: Record<string, number> | null;
  strengths?: string | null;
  improvements?: string | null;
  comments?: string | null;
  submittedAt?: string | null;
  employee: { id: string; firstName: string; lastName: string };
  reviewerId?: string | null;
  cycle?: { id: string; name: string } | null;
}

export function getPerformanceReviews(params?: { cycleId?: string; employeeId?: string }) {
  const query = new URLSearchParams();
  if (params?.cycleId) query.set("cycleId", params.cycleId);
  if (params?.employeeId) query.set("employeeId", params.employeeId);
  const qs = query.toString();
  return apiRequest<PerformanceReview[]>(`/hrms/performance/reviews${qs ? `?${qs}` : ""}`);
}

export function createPerformanceReview(body: { cycleId: string; employeeId: string; reviewerId?: string }) {
  return apiRequest<PerformanceReview>("/hrms/performance/reviews", { method: "POST", body });
}

export function updatePerformanceReview(
  id: string,
  body: Partial<{
    overallRating: number | null;
    ratings: Record<string, number> | null;
    strengths: string | null;
    improvements: string | null;
    comments: string | null;
  }>,
) {
  return apiRequest<PerformanceReview>(`/hrms/performance/reviews/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function acknowledgePerformanceReview(id: string) {
  return apiRequest<PerformanceReview>(`/hrms/performance/reviews/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
}

export interface Goal {
  id: string;
  title: string;
  description?: string | null;
  targetDate?: string | null;
  status: string;
  progress: number;
  employee: { id: string; firstName: string; lastName: string };
}

export function getGoals(employeeId?: string) {
  const qs = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  return apiRequest<Goal[]>(`/hrms/goals${qs}`);
}

export function createGoal(body: {
  employeeId?: string;
  cycleId?: string;
  title: string;
  description?: string;
  targetDate?: string;
}) {
  return apiRequest<Goal>("/hrms/goals", { method: "POST", body });
}

export function updateGoal(
  id: string,
  body: Partial<{ title: string; status: string; progress: number; targetDate: string | null }>,
) {
  return apiRequest<Goal>(`/hrms/goals/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

// Analytics

export interface HrmsAnalytics {
  headcount: number;
  byDepartment: { id: string; name: string; count: number }[];
  byStatus: Record<string, number>;
  recentHires: number;
  terminations: number;
  attendance: {
    presentToday: number;
    avgWorkMinutes30d?: number | null;
    pendingCorrections: number;
  };
  leave: {
    pendingRequests: number;
    approvedThisMonth: number;
    usageByType: { name: string; used: number; entitled: number }[];
  };
  payroll?: {
    lastPeriodStatus?: string | null;
    totalNetLastPeriod?: number | null;
  } | null;
  lifecycle: {
    activeOnboarding: number;
    pendingOnboarding: number;
    activeOffboarding: number;
    upcomingReviews: number;
  };
  goals: {
    onTrack: number;
    atRisk: number;
  };
}

export function getHrmsAnalytics() {
  return apiRequest<HrmsAnalytics>("/hrms/analytics");
}

// Payroll additions

export function processPayrollPeriod(id: string) {
  return apiRequest<PayrollPeriod>(`/hrms/payroll/periods/${encodeURIComponent(id)}/process`, { method: "POST" });
}

export function approvePayrollPeriod(id: string) {
  return apiRequest<PayrollPeriod>(`/hrms/payroll/periods/${encodeURIComponent(id)}/approve`, { method: "POST" });
}

export function markPayrollPeriodPaid(id: string) {
  return apiRequest<PayrollPeriod>(`/hrms/payroll/periods/${encodeURIComponent(id)}/mark-paid`, { method: "POST" });
}

export interface PayrollSummaryRow {
  periodId: string;
  name?: string | null;
  status: string;
  headcount: number;
  grossTotal?: number | null;
  netTotal?: number | null;
}

export function getPayrollSummary() {
  return apiRequest<PayrollSummaryRow[]>("/hrms/payroll/summary");
}

/**
 * Downloads the payroll period CSV. `apiRequest` is JSON-only, so this uses
 * the same fetch/auth-header pattern as `downloadFile`.
 */
export async function exportPayrollPeriodCsv(periodId: string): Promise<Blob> {
  const response = await fetch(`${GATEWAY_URL}/hrms/payroll/periods/${encodeURIComponent(periodId)}/export`, {
    method: "GET",
    headers: { ...(await authHeaders()), Accept: "text/csv" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Export error ${response.status}: ${text}`);
  }
  return response.blob();
}
