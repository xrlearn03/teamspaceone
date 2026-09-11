const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ??
  (typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000");

const TOKEN_KEY = "teamspace-one:accessToken";
const REFRESH_TOKEN_KEY = "teamspace-one:refreshToken";

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
  if (typeof window === "undefined") return null;
  return localStorage.getItem("teamspace-one:organisationId");
}

function readToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function writeToken(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

function deleteToken(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

export async function setAccessToken(token: string): Promise<void> {
  accessTokenCache = token;
  writeToken(TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  if (accessTokenCache === undefined) {
    accessTokenCache = readToken(TOKEN_KEY);
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
    refreshTokenCache = readToken(REFRESH_TOKEN_KEY);
  }
  return refreshTokenCache;
}

async function storeTokens(tokens: TokenPair): Promise<void> {
  accessTokenCache = tokens.accessToken;
  refreshTokenCache = tokens.refreshToken;
  writeToken(TOKEN_KEY, tokens.accessToken);
  writeToken(REFRESH_TOKEN_KEY, tokens.refreshToken);
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
    const tokens = (await response.json()) as TokenPair;
    await storeTokens(tokens);
    return tokens.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });
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

  if (token) headers.Authorization = `Bearer ${token}`;
  if (org) headers["x-organisation-id"] = org;

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
    if (
      retryAfterRefresh &&
      !["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"].includes(path)
    ) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return apiRequest<T>(path, options, false);
    }
    await clearAccessToken();
    throw new Error("Unauthorized");
  }
  if (response.status === 429) {
    if (rateLimitRetries > 0) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
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
  return (await response.json()) as Promise<T>;
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

export interface UserContext {
  id: string;
  organisationId: string;
  permissions: string[];
  dataScopes: { module: string; scope: "own" | "assigned" | "team" | "department" | "organisation"; scopeValue?: string | null }[];
  isSuperAdmin?: boolean;
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ user: UserDto; tokens: TokenPair }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await storeTokens(result.tokens);
  return result;
}

export async function register(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
) {
  const result = await apiRequest<{ user: UserDto; tokens: TokenPair }>("/auth/register", {
    method: "POST",
    body: { email, password, firstName, lastName },
  });
  await storeTokens(result.tokens);
  return result;
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<void>("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
}

export function getMe() {
  return apiRequest<UserDto>("/auth/me");
}

export function getOrganisations() {
  return apiRequest<Organisation[]>("/organisations");
}

export function getMyContext(organisationId: string) {
  return apiRequest<UserContext>(`/organisations/${organisationId}/me/context`);
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await apiRequest<void>("/auth/logout", { method: "POST", body: { refreshToken }, org: null }, false).catch(() => undefined);
  }
  await clearAccessToken();
}

export interface OrganisationMember {
  id: string;
  userId: string;
  organisationId: string;
  role: { id: string; name: string; roleCategory?: string };
  createdAt: string;
}

export function requestPasswordReset(email: string) {
  return apiRequest<{ requested: boolean }>("/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword(email: string, code: string, newPassword: string) {
  return apiRequest<{ reset: boolean }>("/auth/reset-password", { method: "POST", body: { email, code, newPassword } });
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

export function acceptInvitation(token: string) {
  return apiRequest<OrganisationMember>("/organisations/invitations/accept", { method: "POST", body: { token }, org: null });
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const org = getActiveOrganisation();
  const headers: Record<string, string> = { Accept: "application/json" };
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
