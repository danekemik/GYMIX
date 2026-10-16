import type { PGliteInterface } from '@electric-sql/pglite';
import { localDrizzle } from './drizzle';
import { sql } from 'drizzle-orm';
import { parseCatalog } from '@gymix/catalog/parse';
import { collectMigrations, migrateBrowser, parseMigrationJournal, parseReference, seedFromData } from '@gymix/db/browser';
import { initializeSyncStore } from '../sync/store';
import { exercises } from '@gymix/db/schema';
import catalogSource from '../../../../../reference/exercise_catalog_v1.md?raw';
import referenceSource from '../../../../../reference/exercise_database.md?raw';
import journalSource from '../../../../../packages/db/drizzle/meta/_journal.json?raw';

const sources = import.meta.glob('../../../../../packages/db/drizzle/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const sqlFor = new Map(Object.entries(sources).map(([path, source]) => [path.split('/').at(-1)!.replace(/\.sql$/, ''), source]));

export async function bootstrapLocalDb(pglite: PGliteInterface): Promise<void> {
  await migrateBrowser(pglite, collectMigrations(parseMigrationJournal(journalSource), sqlFor));
  const db = localDrizzle(pglite);
  await initializeSyncStore(db);
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(exercises);
    if ((row?.n ?? 0) === 0) {
      await seedFromData(tx, parseCatalog(catalogSource), parseReference(referenceSource));
    }
  });
}
