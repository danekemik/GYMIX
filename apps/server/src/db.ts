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

  try {
    if (config.runMigrations && config.migrationsDir) {
      // Session lock is paired with unlock on this same reserved connection.
      const client = await pool.connect();
      try {
        await client.query("SELECT pg_advisory_lock(hashtext('gymix:migrate'))");
        await migrate(drizzle(client), { migrationsFolder: config.migrationsDir });
      } finally {
        try { await client.query("SELECT pg_advisory_unlock(hashtext('gymix:migrate'))"); }
        finally { client.release(); }
      }
    } else {
      logger.info('миграции пропущены: APP_MIGRATE=false или MIGRATIONS_DIR не задан');
    }
    const db = pgDb as unknown as Db;
    if (config.runSeed) await seedIfEmpty(db, config, logger);
    return { db, close: async () => pool.end() };
  } catch (error) {
    await pool.end();
    throw error;
  }
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('gymix:seed'))`);

    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(exercises);
    if ((row?.n ?? 0) > 0) return false;

    const catalog = parseCatalogFile(join(referenceDir, 'exercise_catalog_v1.md'));
    const reference = parseReference(
      readFileSync(join(referenceDir, 'exercise_database.md'), 'utf8'),
    );
    const counts = await seedFromData(tx, catalog, reference);
    logger.info({ counts }, 'референсные справочники посеяны');
    return true;
  });

  return seeded;
}
