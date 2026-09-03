import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

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

export async function initLocalDb(): Promise<Database> {
  if (db) return db;
  db = await Database.load('sqlite:reactify.db');
  return db;
}

export async function queueOfflineAction(
  item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'retryCount' | 'payload'> & { payload: unknown },
): Promise<void> {
  const database = await initLocalDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await database.execute(
    'INSERT INTO offline_queue (id, type, payload, organisation_id, retry_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, item.type, JSON.stringify(item.payload), item.organisationId, 0, createdAt],
  );
}

export async function getOfflineQueue(organisationId: string): Promise<OfflineQueueItem[]> {
  const database = await initLocalDb();
  const rows = await database.select<
    Array<{ id: string; type: string; payload: string; organisation_id: string; retry_count: number; created_at: string }>
  >('SELECT * FROM offline_queue WHERE organisation_id = ? ORDER BY created_at ASC', [organisationId]);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: r.payload,
    organisationId: r.organisation_id,
    retryCount: r.retry_count,
    createdAt: r.created_at,
  }));
}

export async function deleteOfflineAction(id: string): Promise<void> {
  const database = await initLocalDb();
  await database.execute('DELETE FROM offline_queue WHERE id = ?', [id]);
}

export async function saveDraft(draft: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<void> {
  const database = await initLocalDb();
  const id = draft.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await database.execute(
    `INSERT INTO drafts (id, organisation_id, workspace_id, type, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at`,
    [id, draft.organisationId, draft.workspaceId ?? null, draft.type, draft.content, now, now],
  );
}

export async function getDrafts(organisationId: string, workspaceId?: string): Promise<Draft[]> {
  const database = await initLocalDb();
  const where = workspaceId ? 'organisation_id = ? AND workspace_id = ?' : 'organisation_id = ?';
  const params = workspaceId ? [organisationId, workspaceId] : [organisationId];
  const rows = await database.select<
    Array<{ id: string; organisation_id: string; workspace_id: string | null; type: string; content: string; created_at: string; updated_at: string }>
  >(`SELECT * FROM drafts WHERE ${where} ORDER BY updated_at DESC`, params);
  return rows.map((r) => ({
    id: r.id,
    organisationId: r.organisation_id,
    workspaceId: r.workspace_id ?? undefined,
    type: r.type,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function setCache(key: string, organisationId: string, value: unknown): Promise<void> {
  const database = await initLocalDb();
  const cachedAt = new Date().toISOString();
  await database.execute(
    'INSERT INTO cache (key, organisation_id, value, cached_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, cached_at = excluded.cached_at',
    [key, organisationId, JSON.stringify(value), cachedAt],
  );
}

export async function getCache(key: string, organisationId: string): Promise<unknown | null> {
  const database = await initLocalDb();
  const rows = await database.select<Array<{ value: string }>>('SELECT value FROM cache WHERE key = ? AND organisation_id = ?', [key, organisationId]);
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return rows[0].value;
  }
}
