import { sql } from 'drizzle-orm';
import { readEntity } from '@gymix/db/sync-data';
import type { Db } from '@gymix/db/seed-data';
import type { SyncChange, SyncEntity, SyncRecord, SyncReply } from '@gymix/contracts';
import type { GymixDb } from '../../lib/db';

export interface QueueEntry { seq: number; operationId: string; key: string; payload: SyncEntity | null; deleted?: boolean; baseVersion: string | null; prepared: boolean; state: 'pending' | 'conflict'; reply: SyncReply | null; }
export async function rows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> { return ((await db.execute(query)) as unknown as { rows: T[]; }).rows; }
export async function initializeSyncStore(db: Db): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS local_outbox (
    seq serial PRIMARY KEY, operation_id uuid NOT NULL UNIQUE, key text NOT NULL,
    payload jsonb, base_version text, prepared boolean NOT NULL DEFAULT false,
    state text NOT NULL DEFAULT 'pending', reply jsonb
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS local_outbox_key ON local_outbox(key)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS local_sync_meta (key text PRIMARY KEY, version text, payload jsonb)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS local_recovery (id uuid PRIMARY KEY, key text NOT NULL, payload jsonb, saved_at timestamptz NOT NULL DEFAULT now())`);
}
export type StoreChange = 'local' | 'sync';
const listeners = new Set<(reason: StoreChange) => void>();
const channel = typeof window !== 'undefined' ? new BroadcastChannel('gymix:local-changes') : null;
channel?.addEventListener('message', event => listeners.forEach(fn => fn(event.data === 'sync' ? 'sync' : 'local')));
export function notifyStore(reason: StoreChange = 'local'): void { listeners.forEach(fn => fn(reason)); channel?.postMessage(reason); }
export function subscribeStore(fn: (reason: StoreChange) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

export async function localChange<T>(db: GymixDb, key: string | ((result: T) => string), mutate: (scoped: GymixDb) => Promise<T>): Promise<T> {
  const result = await db.db.transaction(async (tx) => {
    if (typeof key === 'string' && key.startsWith('workout:') && await workoutReadOnly(db, key, tx)) {
      throw new Error('Тренировка продолжается на другом устройстве. Локальные изменения сохранены; сначала разрешите конфликт.');
    }
    const result = await mutate({ ...db, db: tx as unknown as GymixDb['db'] });
    const changedKey = typeof key === 'string' ? key : key(result);
    const payload = await readEntity(tx, db.account.userId, changedKey);
    const [pending] = await rows<{ seq: number; }>(tx, sql`SELECT seq FROM local_outbox WHERE key=${changedKey} AND prepared=false AND state='pending' ORDER BY seq DESC LIMIT 1`);
    if (pending) await tx.execute(sql`UPDATE local_outbox SET payload=${JSON.stringify(payload)}::jsonb WHERE seq=${pending.seq}`);
    else await tx.execute(sql`INSERT INTO local_outbox (operation_id, key, payload) VALUES (${crypto.randomUUID()}, ${changedKey}, ${JSON.stringify(payload)}::jsonb)`);
    return result;
  });
  notifyStore(); return result;
}
export async function queueEntries(db: Db): Promise<QueueEntry[]> {
  return rows(db, sql`SELECT seq, operation_id AS "operationId", key, payload, base_version AS "baseVersion", prepared, state, reply FROM local_outbox ORDER BY seq`);
}
export async function nextChange(db: Db): Promise<{ seq: number; change: SyncChange; } | null> {
  return db.transaction(async (tx) => {
    const queue = await queueEntries(tx);
    const blocked = new Set(queue.filter(x => x.state === 'conflict').map(x => x.key));
    const next = queue.find(x => x.state === 'pending' && !blocked.has(x.key));
    if (!next) return null;
    if (!next.prepared) {
      const [meta] = await rows<{ version: string | null; }>(tx, sql`SELECT version FROM local_sync_meta WHERE key=${next.key}`);
      next.baseVersion = meta?.version ?? null;
      await tx.execute(sql`UPDATE local_outbox SET prepared=true, base_version=${next.baseVersion} WHERE seq=${next.seq}`);
    }
    return { seq: next.seq, change: { operationId: next.operationId, key: next.key, baseVersion: next.baseVersion, payload: next.payload, claim: false } };
  });
}
export async function remember(db: Db, record: SyncRecord): Promise<void> {
  await db.execute(sql`INSERT INTO local_sync_meta (key, version, payload) VALUES (${record.key}, ${record.version}, ${JSON.stringify(record.payload)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET version=excluded.version, payload=excluded.payload`);
}

export async function workoutReadOnly(db: GymixDb, key: string, source: Db = db.db): Promise<boolean> {
  const [current] = await rows<{ status: string; owner: string; }>(source, sql`SELECT status, owning_device_id AS owner FROM workout_sessions WHERE id=${key.slice(8)}::uuid AND user_id=${db.account.userId}`);
  if (current?.status === 'active' && current.owner !== db.account.deviceId) return true;
  const conflicts = await rows<QueueEntry>(source, sql`SELECT reply FROM local_outbox WHERE key=${key} AND state='conflict'`);
  return conflicts.some(x => {
    const remote = x.reply?.record.payload;
    return remote?.kind === 'workout' && (remote.status === 'completed' || remote.owningDeviceId !== db.account.deviceId);
  });
}
