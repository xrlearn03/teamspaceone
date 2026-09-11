import { getActiveOrganisation } from "./api";

/**
 * Org-scoped local storage for message features the backend does not
 * persist yet (saved items, composer drafts). Everything is keyed by
 * organisation id so data never leaks across organisations.
 */

function key(suffix: string) {
  return `teamspace-one:${getActiveOrganisation() ?? "none"}:${suffix}`;
}

function read<T>(suffix: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(suffix));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(suffix: string, value: unknown) {
  localStorage.setItem(key(suffix), JSON.stringify(value));
}

// Saved items
export interface SavedMessage {
  id: string;
  channelId: string;
  content: string;
  senderId: string;
  createdAt: string;
  savedAt: string;
}

export function getSavedMessages(): SavedMessage[] {
  return read<SavedMessage[]>("savedMessages", []);
}

export function isSaved(messageId: string): boolean {
  return getSavedMessages().some((m) => m.id === messageId);
}

export function toggleSavedMessage(message: Omit<SavedMessage, "savedAt">): boolean {
  const saved = getSavedMessages();
  const exists = saved.some((m) => m.id === message.id);
  write(
    "savedMessages",
    exists ? saved.filter((m) => m.id !== message.id) : [...saved, { ...message, savedAt: new Date().toISOString() }],
  );
  return !exists;
}

// Composer drafts keyed per channel/thread
export interface DraftEntry {
  value: string;
  updatedAt: string;
}

export function getDraft(draftKey: string): string {
  const drafts = read<Record<string, DraftEntry | string>>("drafts", {});
  const entry = drafts[draftKey];
  return typeof entry === "string" ? entry : entry?.value ?? "";
}

export function listDrafts(): Record<string, DraftEntry> {
  const raw = read<Record<string, DraftEntry | string>>("drafts", {});
  const out: Record<string, DraftEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === "string" ? { value: v, updatedAt: "" } : v;
  }
  return out;
}

export function setDraft(draftKey: string, value: string) {
  const drafts = read<Record<string, DraftEntry>>("drafts", {});
  if (value.trim()) drafts[draftKey] = { value, updatedAt: new Date().toISOString() };
  else delete drafts[draftKey];
  write("drafts", drafts);
}
