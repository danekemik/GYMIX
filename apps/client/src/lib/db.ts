import { PGliteWorker } from '@electric-sql/pglite/worker';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { localDrizzle } from '../data/local/drizzle';
import { sql } from 'drizzle-orm';
import type { Db } from '@gymix/db/browser';
import { exercises, muscleGroups } from '@gymix/db/schema';

export interface GymixDb {
  readonly db: Db & PgliteDatabase;
  readonly pglite: PGliteWorker;
  readonly counts: { readonly exercises: number; readonly muscleGroups: number; };
}

let instance: GymixDb | undefined;
let pending: Promise<GymixDb> | undefined;

export function getDb(): Promise<GymixDb> {
  if (instance) return Promise.resolve(instance);
  pending ??= initDb().then((db) => {
    instance = db;
    return db;
  }).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

async function initDb(): Promise<GymixDb> {
  const worker = new Worker(new URL('../data/local/db.worker.ts', import.meta.url), { type: 'module' });
  const pglite = new PGliteWorker(worker, { id: 'gymix-local-db' });
  try {
    await pglite.waitReady;
    const db = localDrizzle(pglite) as Db & PgliteDatabase;
    const [exerciseCount] = await db.select({ n: sql<number>`count(*)::int` }).from(exercises);
    const [groupCount] = await db.select({ n: sql<number>`count(*)::int` }).from(muscleGroups);
    return { db, pglite, counts: { exercises: exerciseCount?.n ?? 0, muscleGroups: groupCount?.n ?? 0 } };
  } catch (error) {
    await pglite.close();
    worker.terminate();
    throw error;
  }
}

export async function resetDb(): Promise<void> {
  const current = instance ?? await pending?.catch(() => undefined);
  if (current) await current.pglite.close();
  instance = undefined;
  pending = undefined;
}
