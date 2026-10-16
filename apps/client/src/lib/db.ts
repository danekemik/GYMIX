import { PGliteWorker } from '@electric-sql/pglite/worker';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { localDrizzle } from '../data/local/drizzle';
import { sql } from 'drizzle-orm';
import type { Db } from '@gymix/db/browser';
import { devices, exercises, muscleGroups, users } from '@gymix/db/schema';

export interface LocalAccount { userId: string; email: string; deviceId: string; }

export interface GymixDb {
  readonly account: LocalAccount;
  readonly db: Db & PgliteDatabase;
  readonly pglite: PGliteWorker;
  readonly counts: { readonly exercises: number; readonly muscleGroups: number; };
}

const instances = new Map<string, Promise<GymixDb>>();

export function getDb(account: LocalAccount): Promise<GymixDb> {
  const key = `${account.userId}:${account.deviceId}`;
  let pending = instances.get(key);
  if (!pending) {
    pending = initDb(account).catch((error: unknown) => { instances.delete(key); throw error; });
    instances.set(key, pending);
  }
  return pending;
}

async function initDb(account: LocalAccount): Promise<GymixDb> {
  const worker = new Worker(new URL('../data/local/db.worker.ts', import.meta.url), { type: 'module' });
  const pglite = new PGliteWorker(worker, { id: `gymix-account-${account.userId}`, meta: { accountId: account.userId } });
  try {
    await pglite.waitReady;
    const db = localDrizzle(pglite) as Db & PgliteDatabase;
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: account.userId, email: account.email, passwordHash: 'local-account', emailVerifiedAt: new Date() })
        .onConflictDoUpdate({ target: users.id, set: { email: account.email } });
      await tx.insert(devices).values({ id: account.deviceId, userId: account.userId, label: 'Этот браузер' }).onConflictDoNothing();
    });
    const [exerciseCount] = await db.select({ n: sql<number>`count(*)::int` }).from(exercises);
    const [groupCount] = await db.select({ n: sql<number>`count(*)::int` }).from(muscleGroups);
    return { db, pglite, account, counts: { exercises: exerciseCount?.n ?? 0, muscleGroups: groupCount?.n ?? 0 } };
  } catch (error) {
    await pglite.close();
    worker.terminate();
    throw error;
  }
}

export async function resetDb(): Promise<void> {
  const connections = [...instances.values()]; instances.clear();
  await Promise.all(connections.map(async (pending) => { const db = await pending.catch(() => undefined); await db?.pglite.close(); }));
}
