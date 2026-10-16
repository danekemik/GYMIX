import { sql } from 'drizzle-orm';
import { entityKeys, readEntity, writeEntity } from '@gymix/db/sync-data';
import { canonical, type SyncRecord, type SyncReply, type SyncSnapshot } from '@gymix/contracts';
import type { GymixDb } from '../../lib/db';
import { accountRequest } from '../auth/api';
import { getSession } from '../auth/session';
import { nextChange, notifyStore, queueEntries, remember, rows } from './store';
export type SyncTransport = <T>(path: string, body?: unknown) => Promise<T>;

export async function synchronize(db: GymixDb, request: SyncTransport = accountRequest): Promise<void> {
  // The caller serializes rounds across tabs. Prepared payloads are immutable
  // and survive a lost reply: retry uses the same ID, payload and base version.
  for (let sent = 0; sent < 1000; sent++) {
    const item = await nextChange(db.db);
    if (!item) break;
    const reply = await request<SyncReply>('/sync/change', item.change);
    await db.db.transaction(async (tx) => {
      if (!reply.accepted) {
        await tx.execute(sql`UPDATE local_outbox SET state='conflict', reply=${JSON.stringify(reply)}::jsonb WHERE seq=${item.seq}`);
        return;
      }
      await tx.execute(sql`DELETE FROM local_outbox WHERE seq=${item.seq}`);
      await remember(tx, reply.record);
      const pending = await rows(tx, sql`SELECT seq FROM local_outbox WHERE key=${item.change.key} LIMIT 1`);
      if (!pending.length) await writeEntity(tx, db.account.userId, reply.record.key, reply.record.payload);
    });
    notifyStore();
  }
  const snapshot = await request<SyncSnapshot>('/sync/snapshot');
  if (snapshot.userId !== db.account.userId) throw new Error('Сервер вернул данные другого аккаунта');
  let changed = false;
  await db.db.transaction(async (tx) => {
    const dirty = new Set((await queueEntries(tx)).map(x => x.key));
    const meta = await rows<SyncRecord>(tx, sql`SELECT key, version, payload FROM local_sync_meta`);
    const remote = new Map(snapshot.records.map(x => [x.key, x]));
    for (const previous of meta) if (!remote.has(previous.key)) remote.set(previous.key, { key: previous.key, payload: null, version: null });
    // Templates precede workouts so source-template references resolve.
    for (const record of [...remote.values()].sort((a, b) => Number(!a.key.startsWith('template:')) - Number(!b.key.startsWith('template:')))) {
      if (dirty.has(record.key)) continue;
      const previous = meta.find(x => x.key === record.key);
      if (!previous || previous.version !== record.version) {
        await writeEntity(tx, db.account.userId, record.key, record.payload);
        await remember(tx, record); changed = true;
      }
    }
  });
  if (changed) notifyStore();
}

export async function resolveConflict(db: GymixDb, key: string, choice: 'server' | 'local', request: SyncTransport = accountRequest): Promise<void> {
  // Re-read the server before an explicit resolution; never reuse a stale dialog version.
  const snapshot = await request<SyncSnapshot>('/sync/snapshot');
  if (snapshot.userId !== db.account.userId) throw new Error('Аккаунт изменён');
  let remote = snapshot.records.find(x => x.key === key) ?? { key, version: null, payload: null };
  if (choice === 'local' && remote.payload?.kind === 'workout' && remote.payload.status === 'active' && remote.payload.owningDeviceId !== db.account.deviceId) {
    const claimed = await request<SyncReply>('/sync/change', { operationId: crypto.randomUUID(), key, baseVersion: remote.version, payload: null, claim: true });
    if (!claimed.accepted) throw new Error(claimed.message ?? 'Не удалось передать тренировку');
    remote = claimed.record;
  }
  await db.db.transaction(async (tx) => {
    const local = await readEntity(tx, db.account.userId, key);
    await tx.execute(sql`INSERT INTO local_recovery (id, key, payload) VALUES (${crypto.randomUUID()}, ${key}, ${JSON.stringify({ local, remote: remote.payload, pending: (await queueEntries(tx)).filter(x => x.key === key) })}::jsonb)`);
    await tx.execute(sql`DELETE FROM local_outbox WHERE key=${key}`);
    await remember(tx, remote);
    if (choice === 'server') await writeEntity(tx, db.account.userId, key, remote.payload);
    else {
      if (local?.kind === 'workout' && remote.payload?.kind === 'workout') local.owningDeviceId = remote.payload.owningDeviceId;
      await tx.execute(sql`INSERT INTO local_outbox (operation_id,key,payload,prepared,base_version) VALUES (${crypto.randomUUID()},${key},${JSON.stringify(local)}::jsonb,true,${remote.version})`);
    }
  });
  notifyStore();
}
export async function takeOwnership(db: GymixDb, key: string): Promise<void> {
  if ((await queueEntries(db.db)).some(x => x.key === key)) throw new Error('Сначала разрешите конфликт локальных изменений');
  const snapshot = await accountRequest<SyncSnapshot>('/sync/snapshot');
  const remote = snapshot.records.find(x => x.key === key);
  if (!remote || snapshot.userId !== db.account.userId) throw new Error('Тренировка не найдена');
  const reply = await accountRequest<SyncReply>('/sync/change', { operationId: crypto.randomUUID(), key, payload: null, baseVersion: remote.version, claim: true });
  if (!reply.accepted) throw new Error(reply.message ?? 'Не удалось передать тренировку');
  await db.db.transaction(async tx => {
    const pending = await rows(tx, sql`SELECT seq FROM local_outbox WHERE key=${key} LIMIT 1`);
    if (pending.length) throw new Error('Сначала разрешите конфликт локальных изменений');
    await writeEntity(tx, db.account.userId, key, reply.record.payload); await remember(tx, reply.record);
  });
  notifyStore();
}
