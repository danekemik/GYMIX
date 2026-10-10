import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { parseCatalogFile } from '@gymix/catalog';
import { parseReference } from '@gymix/db/parse';
import { seedFromData, type Db } from '@gymix/db/seed-data';
import { exercises } from '@gymix/db/schema';
import type { AppConfig } from './env.js';
import type { Logger } from './logger.js';

/**
 * Подключение к PostgreSQL + применение миграций + посев референсных
 * справочников (каталог и reference). Все три операции выносятся сюда,
 * чтобы `index.ts` был тонким, а тесты строили своё окружение на PGlite.
 */

export interface DbConnection {
  db: Db;
  close: () => Promise<void>;
}

export async function connectDb(config: AppConfig, logger: Logger): Promise<DbConnection> {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const pgDb = drizzle(pool);

  pool.on('error', (error) => {
    logger.error({ error: error.message }, 'простаивающий клиент пула упал');
  });

  if (config.runMigrations && config.migrationsDir) {
    await migrate(pgDb, { migrationsFolder: config.migrationsDir });
  } else {
    logger.info('миграции пропущены: APP_MIGRATE=false или MIGRATIONS_DIR не задан');
  }

  const db = pgDb as unknown as Db;

  if (config.runSeed) {
    await seedIfEmpty(db, config, logger);
  }

  return { db, close: async () => pool.end() };
}

/** Проверка живости БД для /healthz. */
export async function pingDb(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Посев выполняется только на пустой каталог и защищён advisory lock:
 * два инстанса, стартующие одновременно, не сеют дважды.
 */
export async function seedIfEmpty(
  db: Db,
  config: AppConfig,
  logger: Logger,
): Promise<boolean> {
  const referenceDir = config.referenceDir;
  if (!referenceDir) {
    logger.warn('REFERENCE_DIR не задан — посев каталога пропущен');
    return false;
  }

  const seeded = await db.transaction(async (tx) => {
    const res = (await tx.execute(
      sql`select pg_try_advisory_lock(hashtext('gymix:seed')) as locked`,
    )) as { rows: Array<{ locked: boolean }> };
    if (!(res.rows[0]?.locked ?? false)) return false;

    try {
      const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(exercises);
      if ((row?.n ?? 0) > 0) return false;

      const catalog = parseCatalogFile(join(referenceDir, 'exercise_catalog_v1.md'));
      const reference = parseReference(
        readFileSync(join(referenceDir, 'exercise_database.md'), 'utf8'),
      );
      const counts = await seedFromData(tx, catalog, reference);
      logger.info({ counts }, 'референсные справочники посеяны');
      return true;
    } finally {
      await tx.execute(sql`select pg_advisory_unlock(hashtext('gymix:seed'))`);
    }
  });

  return seeded;
}