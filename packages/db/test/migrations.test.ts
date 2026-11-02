import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';
import { collectMigrations, migrateBrowser, parseMigrationJournal } from '../src/migration-browser.js';

const dir = fileURLToPath(new URL('../drizzle/', import.meta.url));
const migrations = collectMigrations(
  parseMigrationJournal(readFileSync(`${dir}/meta/_journal.json`, 'utf8')),
  new Map(readdirSync(dir).filter((name) => name.endsWith('.sql')).map((name) => [name.replace(/\.sql$/, ''), readFileSync(`${dir}/${name}`, 'utf8')])),
);

it('обновляет старую браузерную БД, сохраняет данные и не повторяет DDL', async () => {
  const db = new PGlite();
  try {
    for (const statement of migrations[0]!.sql) await db.exec(statement);
    await db.query("INSERT INTO users (email, password_hash) VALUES ('kept@example.com', 'hash')");
    await migrateBrowser(db, migrations);
    await migrateBrowser(db, migrations);
    expect((await db.query('SELECT email FROM users')).rows).toEqual([{ email: 'kept@example.com' }]);
    expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='devices' AND column_name='installation_id'")).rows).toHaveLength(1);
    const broken = [...migrations, { tag: 'broken', sql: ['CREATE TABLE must_rollback (id int)', 'INVALID SQL'] }];
    await expect(migrateBrowser(db, broken)).rejects.toThrow();
    expect((await db.query("SELECT to_regclass('must_rollback') AS value")).rows).toEqual([{ value: null }]);
    await migrateBrowser(db, migrations);
  } finally { await db.close(); }
}, 30000);

it('инициализирует новую базу и отвергает изменённую применённую миграцию', async () => {
  const db = new PGlite();
  try {
    await migrateBrowser(db, migrations);
    expect((await db.query('SELECT tag FROM _gymix_migrations')).rows).toHaveLength(migrations.length);
    await expect(migrateBrowser(db, [{ ...migrations[0]!, sql: ['SELECT 1'] }, ...migrations.slice(1)])).rejects.toThrow('несовместима');
  } finally { await db.close(); }
}, 30000);
