import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from '@gymix/db/seed-data';

/** Each environment gets its own disposable database. Never migrate the URL's
 * database: it must be explicitly named *_test and only acts as a test admin. */
export async function createPostgresTestDb(url: string, migrationsFolder: string) {
  const base = new URL(url);
  if (!base.pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL должен указывать на базу с суффиксом _test');
  const database = `gymix_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE DATABASE "${database}"`);
  const child = new URL(url);
  child.pathname = `/${database}`;
  const pool = new pg.Pool({ connectionString: child.toString(), max: 4 });
  const close = async () => {
    await pool.end();
    try { await admin.query(`DROP DATABASE "${database}"`); }
    finally { await admin.end(); }
  };
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
    return { db: db as unknown as Db, close };
  } catch (error) {
    await close();
    throw error;
  }
}
