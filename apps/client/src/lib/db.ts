import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { parseCatalog } from '@gymix/catalog/parse';
import { parseMigrationJournal, parseReference, seedFromData, type Db } from '@gymix/db/browser';
import { exercises } from '@gymix/db/schema';
import catalogSource from '../../../../reference/exercise_catalog_v1.md?raw';
import referenceSource from '../../../../reference/exercise_database.md?raw';
import journalSource from '../../../../packages/db/drizzle/meta/_journal.json?raw';
import migration0000 from '../../../../packages/db/drizzle/0000_sudden_silk_fever.sql?raw';

export interface GymixDb {
  readonly db: Db & PgliteDatabase;
  readonly pglite: PGlite;
  readonly counts: {
    readonly exercises: number;
    readonly muscleGroups: number;
  };
}

let instance: GymixDb | undefined;
let pending: Promise<GymixDb> | undefined;

/**
 * Единый инстанс PGlite на страницу. Персистентная БД в IndexedDB
 * (`idb://gymix`), миграции применяются только на пустой БД, каталог
 * и reference засеиваются из канонических markdown-файлов (`?raw`).
 */
export function getDb(): Promise<GymixDb> {
  if (instance !== undefined) return Promise.resolve(instance);
  if (pending === undefined) {
    pending = initDb().then((db) => {
      instance = db;
      return db;
    });
  }
  return pending;
}

async function initDb(): Promise<GymixDb> {
  const pglite = new PGlite('idb://gymix', { relaxedDurability: true });
  await pglite.waitReady;

  // Миграции только на свежую БД: если таблица exercises уже есть,
  // персистентная БД готова и повторный DDL сломает её.
  const existing = await hasTable(pglite, 'exercises');
  if (!existing) {
    const tags = parseMigrationJournal(journalSource);
    for (const tag of tags) {
      const sqlText = tag === '0000_sudden_silk_fever' ? migration0000 : undefined;
      if (sqlText === undefined) throw new Error(`нет SQL миграции «${tag}»`);
      await pglite.exec(sqlText);
    }
  }

  const db = drizzle(pglite) as Db & PgliteDatabase;

  let counts;
  if (!existing) {
    counts = await seedFromData(db, parseCatalog(catalogSource), parseReference(referenceSource));
  } else {
    counts = await countsFrom(db);
  }

  return {
    db,
    pglite,
    counts: { exercises: counts.exercises, muscleGroups: counts.muscleGroups },
  };
}

async function hasTable(pglite: PGlite, table: string): Promise<boolean> {
  const result = await pglite.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_tables WHERE tablename = $1`,
    [table],
  );
  return (result.rows[0]?.n ?? 0) > 0;
}

async function countsFrom(db: Db): Promise<{ exercises: number; muscleGroups: number }> {
  return {
    exercises: (await db.select({ n: sql<number>`count(*)::int` }).from(exercises)).at(0)?.n ?? 0,
    muscleGroups: -1,
  };
}

export async function resetDb(): Promise<void> {
  if (instance !== undefined) {
    await instance.pglite.close();
    instance = undefined;
    pending = undefined;
  }
}