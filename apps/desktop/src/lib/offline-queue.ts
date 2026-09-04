import { getActiveOrganisation, sendMessage } from "./api";

/**
 * Offline outbox. Inside Tauri the queue is persisted in the local SQLite
 * `offline_queue` table (created by a migration in src-tauri); in browser/dev
 * it falls back to localStorage. All entries are scoped by organisation id.
 */

export interface QueuedMessage {
  id: string;
  type: "message";
  payload: { channelId: string; content: string; attachmentIds?: string[]; parentMessageId?: string };
  organisationId: string;
  createdAt: string;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const LS_KEY = "teamspace-one:offlineQueue";

let dbPromise: Promise<import("@tauri-apps/plugin-sql").default> | null = null;

async function db() {
  if (!dbPromise) {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    dbPromise = Database.load("sqlite:teamspace-one.db");
  }
  return dbPromise;
}

function readLocal(): QueuedMessage[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as QueuedMessage[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: QueuedMessage[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

export async function enqueueMessage(
  payload: QueuedMessage["payload"],
): Promise<QueuedMessage> {
  const item: QueuedMessage = {
    id: crypto.randomUUID(),
    type: "message",
    payload,
    organisationId: getActiveOrganisation() ?? "none",
    createdAt: new Date().toISOString(),
  };
  if (isTauri) {
    try {
      const database = await db();
      await database.execute(
        "INSERT INTO offline_queue (id, type, payload, organisation_id, retry_count, created_at) VALUES (?, ?, ?, ?, 0, ?)",
        [item.id, item.type, JSON.stringify(item.payload), item.organisationId, item.createdAt],
      );
      return item;
    } catch {
      // fall through to localStorage
    }
  }
  writeLocal([...readLocal(), item]);
  return item;
}

export async function listQueuedMessages(): Promise<QueuedMessage[]> {
  if (isTauri) {
    try {
      const database = await db();
      const rows = await database.select<{
        id: string;
        type: string;
        payload: string;
        organisation_id: string;
        created_at: string;
      }[]>(
        "SELECT id, type, payload, organisation_id, created_at FROM offline_queue WHERE organisation_id = ? ORDER BY created_at",
        [getActiveOrganisation() ?? "none"],
      );
      return rows.map((row) => ({
        id: row.id,
        type: "message",
        payload: JSON.parse(row.payload),
        organisationId: row.organisation_id,
        createdAt: row.created_at,
      }));
    } catch {
      // fall through to localStorage
    }
  }
  return readLocal().filter((item) => item.organisationId === (getActiveOrganisation() ?? "none"));
}

export async function removeQueuedMessage(id: string): Promise<void> {
  if (isTauri) {
    try {
      const database = await db();
      await database.execute("DELETE FROM offline_queue WHERE id = ?", [id]);
      return;
    } catch {
      // fall through to localStorage
    }
  }
  writeLocal(readLocal().filter((item) => item.id !== id));
}

export async function queuedMessageCount(): Promise<number> {
  return (await listQueuedMessages()).length;
}

/** Flush queued messages for the active organisation. Returns the count sent. */
export async function flushQueue(): Promise<number> {
  const items = await listQueuedMessages();
  let sent = 0;
  for (const item of items) {
    if (item.type !== "message") continue;
    try {
      await sendMessage(
        item.payload.channelId,
        item.payload.content,
        item.payload.attachmentIds,
        item.payload.parentMessageId,
      );
      await removeQueuedMessage(item.id);
      sent++;
    } catch {
      break; // still offline or server rejected — keep the rest queued
    }
  }
  return sent;
}
