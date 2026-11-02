import { and, eq } from 'drizzle-orm';
import { canonical, type SyncChange, type SyncRecord, type SyncReply } from '@gymix/contracts';
import { readEntity, writeEntity } from '@gymix/db/sync-data';
import { syncReceipts, users, workoutSessions, workoutTemplates } from '@gymix/db/schema';
import type { Db } from '@gymix/db/seed-data';
import { sha256Hex } from '../crypto.js';
import { HttpError } from '../errors.js';

export async function readRecord(db: Db, userId: string, key: string): Promise<SyncRecord> {
  const payload = await readEntity(db, userId, key);
  return { key, payload, version: payload ? sha256Hex(canonical(payload)) : null };
}
export async function applyAccountChange(db: Db, userId: string, deviceId: string, change: SyncChange): Promise<SyncReply> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!user || user.deletedAt) throw HttpError.unauthorized();
    const requestHash = sha256Hex(canonical({ deviceId, change }));
    const [receipt] = await tx.select().from(syncReceipts).where(and(eq(syncReceipts.userId, userId), eq(syncReceipts.operationId, change.operationId)));
    if (receipt) {
      if (receipt.requestHash !== requestHash) throw new HttpError(409, 'conflict', 'operationId уже использован для другого изменения');
      return receipt.response as unknown as SyncReply;
    }
    const [kind, id] = change.key.split(':') as [string, string];
    // Prevent UUID collisions from turning an upsert into a cross-account write.
    const table = kind === 'workout' ? workoutSessions : kind === 'template' ? workoutTemplates : null;
    if (table) {
      const [parent] = await tx.select({ userId: table.userId }).from(table).where(eq(table.id, id)).for('update');
      if (parent && parent.userId !== userId) throw HttpError.notFound();
    }
    const current = await readRecord(tx, userId, change.key);
    if (current.version !== change.baseVersion) return { accepted: false, reason: 'conflict', message: 'Запись изменена на другом устройстве. Локальный вариант сохранён.', record: current };
    const existing = current.payload;
    if (existing?.kind === 'workout' && existing.status === 'active' && existing.owningDeviceId !== deviceId && !change.claim) {
      return { accepted: false, reason: 'ownership_required', message: 'Тренировка продолжается на другом устройстве. Локальные изменения сохранены.', record: current };
    }
    if (change.claim) {
      if (existing?.kind !== 'workout' || existing.status !== 'active') return { accepted: false, reason: 'operation_rejected', message: 'Передать можно только активную тренировку', record: current };
      await tx.update(workoutSessions).set({ owningDeviceId: deviceId, revision: existing.revision + 1, updatedAt: new Date() }).where(eq(workoutSessions.id, id));
    } else {
      const payload = change.payload;
      if (existing?.kind === 'workout' && existing.status === 'completed') {
        if (!payload || payload.kind !== 'workout' || payload.status !== 'completed') return { accepted: false, reason: 'operation_rejected', message: 'Завершённую тренировку нельзя удалить или возобновить', record: current };
        const before = existing.exercises.map(e => `${e.id}:${e.name}:${e.sets.map(s => s.id).sort().join(',')}`).sort();
        const after = payload.exercises.map(e => `${e.id}:${e.name}:${e.sets.map(s => s.id).sort().join(',')}`).sort();
        if (canonical(before) !== canonical(after)) return { accepted: false, reason: 'operation_rejected', message: 'В истории нельзя менять состав упражнений и подходов', record: current };
      }
      if (payload?.kind === 'workout') {
        if (payload.status === 'completed' && !(existing?.kind === 'workout' && existing.status === 'completed') && !payload.exercises.some(e => e.status === 'completed')) {
          return { accepted: false, reason: 'operation_rejected', message: 'Нет выполненных упражнений', record: current };
        }
        if (payload.status === 'active') {
          const active = await tx.select({ id: workoutSessions.id }).from(workoutSessions).where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, 'active')));
          if (active.some(row => row.id !== id)) return { accepted: false, reason: 'operation_rejected', message: 'Сначала завершите или удалите другую активную тренировку', record: current };
        }
        payload.owningDeviceId = existing?.kind === 'workout' ? existing.owningDeviceId : deviceId;
        payload.revision = existing?.kind === 'workout' ? existing.revision + 1 : 1;
      }
      // Validate and apply in a savepoint. SQL failure cannot partially rewrite a record.
      try { await tx.transaction(async (savepoint) => { await writeEntity(savepoint, userId, change.key, payload); }); }
      catch { return { accepted: false, reason: 'operation_rejected', message: 'Изменение не прошло проверку данных. Локальный вариант сохранён.', record: current }; }
    }
    const response: SyncReply = { accepted: true, record: await readRecord(tx, userId, change.key) };
    await tx.insert(syncReceipts).values({ userId, operationId: change.operationId, requestHash, response });
    return response;
  }, { isolationLevel: 'serializable' });
}
