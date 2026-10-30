import { users, devices } from '@gymix/db/schema';
import type { PGliteInterface } from '@electric-sql/pglite';
import type { GymixDb } from '../../lib/db';
import { localDrizzle } from './drizzle';
import { executeReadModel } from './read-models';
import { readChannel, type ReadRequest } from './read-rpc';
import { executeSessionCommand } from './session-server';
import { executeSyncCommand } from '../sync/local';

/** Installed only in the elected worker, after migration and seed complete. */
export function serveReadModels(pglite: PGliteInterface, userId: string) {
  const channel = new BroadcastChannel(readChannel(userId));
  const db = localDrizzle(pglite) as GymixDb['db'];
  channel.addEventListener('message', async (event: MessageEvent<ReadRequest>) => {
    const request = event.data;
    if (!request || !['read', 'initialize', 'command', 'sync'].includes(request.type) || typeof request.id !== 'string' || typeof request.deviceId !== 'string') return;
    const source = { db, pglite, account: { userId, email: '', deviceId: request.deviceId }, counts: { exercises: 0, muscleGroups: 0 } } as unknown as GymixDb;
    try {
      let data;
      if (request.type === 'initialize') {
        if (typeof request.email !== 'string') throw new Error('Не задан аккаунт');
        await db.transaction(async tx => {
          await tx.insert(users).values({ id: userId, email: request.email, passwordHash: 'local-account', emailVerifiedAt: new Date() })
            .onConflictDoUpdate({ target: users.id, set: { email: request.email } });
          await tx.insert(devices).values({ id: request.deviceId, userId, label: 'Этот браузер' }).onConflictDoNothing();
        });
        const result = await pglite.query('SELECT (SELECT count(*)::int FROM exercises) AS exercises, (SELECT count(*)::int FROM muscle_groups) AS "muscleGroups"');
        data = result.rows[0];
      } else if (request.type === 'sync') {
        data = await executeSyncCommand(source, request.command);
      } else if (request.type === 'command') {
        data = await db.transaction(tx => executeSessionCommand({ ...source, db: tx as unknown as GymixDb['db'] }, request.command));
      } else if (request.key.startsWith('record:') || request.key.startsWith('resume:')) {
        // Read a coherent snapshot and avoid a filesystem flush after every
        // SELECT in a multi-table workout, while retaining PGlite's locks.
        data = await db.transaction(tx => executeReadModel({ ...source, db: tx as unknown as GymixDb['db'] }, request.key, request.params));
      } else data = await executeReadModel(source, request.key, request.params);
      channel.postMessage({ type: 'result', id: request.id, data });
    } catch (error) {
      channel.postMessage({ type: 'result', id: request.id, error: error instanceof Error ? error.message : 'Не удалось прочитать данные' });
    }
  });
  channel.postMessage({ type: 'ready' });
  return () => channel.close();
}
