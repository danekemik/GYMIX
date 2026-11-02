import { sql } from 'drizzle-orm';
import { writeEntity } from '@gymix/db/sync-data';
import type { GymixDb } from '../../lib/db';
import type { SyncRecord } from '@gymix/contracts';
import type { SyncCommand, SyncCommandReply } from '../local/sync-commands';
import { nextChange, queueEntries, remember, rows } from './store';

/** Network requests stay in the caller. Each local transaction runs beside the
 * database so background sync cannot hold its lock over dozens of RPC calls. */
export async function executeSyncCommand(db: GymixDb, command: SyncCommand): Promise<SyncCommandReply> {
  if (command.kind === 'next') return { item: await nextChange(db.db) };
  if (command.kind === 'ack') {
    const { seq, key, reply } = command;
    await db.db.transaction(async tx => {
      if (!reply.accepted) {
        await tx.execute(sql`UPDATE local_outbox SET state='conflict', reply=${JSON.stringify(reply)}::jsonb WHERE seq=${seq}`);
        return;
      }
      if (reply.record.key !== key) throw new Error('Сервер подтвердил другую запись');
      await tx.execute(sql`DELETE FROM local_outbox WHERE seq=${seq}`);
      await remember(tx, reply.record);
      const pending = await rows(tx, sql`SELECT seq FROM local_outbox WHERE key=${key} LIMIT 1`);
      if (!pending.length) await writeEntity(tx, db.account.userId, reply.record.key, reply.record.payload);
    });
    return {};
  }
  if (command.kind !== 'snapshot') throw new Error('Неизвестное действие синхронизации');
  const { snapshot } = command;
  if (snapshot.userId !== db.account.userId) throw new Error('Сервер вернул данные другого аккаунта');
  let changed = false;
  await db.db.transaction(async tx => {
    const dirty = new Set((await queueEntries(tx)).map(x => x.key));
    const meta = await rows<SyncRecord>(tx, sql`SELECT key, version, payload FROM local_sync_meta`);
    const remote = new Map(snapshot.records.map(x => [x.key, x]));
    for (const previous of meta) if (!remote.has(previous.key)) remote.set(previous.key, { key: previous.key, payload: null, version: null });
    for (const record of [...remote.values()].sort((a, b) => Number(!a.key.startsWith('template:')) - Number(!b.key.startsWith('template:')))) {
      if (dirty.has(record.key)) continue;
      const previous = meta.find(x => x.key === record.key);
      if (!previous || previous.version !== record.version) {
        await writeEntity(tx, db.account.userId, record.key, record.payload);
        await remember(tx, record); changed = true;
      }
    }
  });
  return { changed };
}
