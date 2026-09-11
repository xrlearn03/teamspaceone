export interface OfflineQueueItem {
  id: string;
  type: string;
  payload: string;
  organisationId: string;
  retryCount: number;
  createdAt: string;
}

export interface Draft {
  id: string;
  organisationId: string;
  workspaceId?: string;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export async function queueOfflineAction(): Promise<void> {}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  return [];
}

export async function deleteOfflineAction(): Promise<void> {}

export async function saveDraft(): Promise<void> {}

export async function getDrafts(): Promise<Draft[]> {
  return [];
}

export async function setCache(key: string, organisationId: string, value: unknown): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.setItem(`teamspace-one:cache:${organisationId}:${key}`, JSON.stringify(value));
}

export async function getCache(key: string, organisationId: string): Promise<unknown | null> {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`teamspace-one:cache:${organisationId}:${key}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function deleteCache(key: string, organisationId: string): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`teamspace-one:cache:${organisationId}:${key}`);
}
