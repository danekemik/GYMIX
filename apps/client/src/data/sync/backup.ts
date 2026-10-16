import { sql } from 'drizzle-orm';
import { entityKeys, readEntity } from '@gymix/db/sync-data';
import type { GymixDb } from '../../lib/db';
import { queueEntries, rows } from './store';
export async function localBackup(db: GymixDb) {
  return db.db.transaction(async tx => ({
    format: 'gymix-local-backup', version: 1, exportedAt: new Date().toISOString(), account: db.account.email,
    records: await Promise.all((await entityKeys(tx, db.account.userId)).map(key => readEntity(tx, db.account.userId, key))),
    pending: await queueEntries(tx), recovery: await rows(tx, sql`SELECT key,payload,saved_at FROM local_recovery ORDER BY saved_at`),
  }));
}
export async function downloadLocalBackup(db: GymixDb): Promise<void> {
  const data = await localBackup(db);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `gymix-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
