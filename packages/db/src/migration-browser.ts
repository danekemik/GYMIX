/**
 * Разбор миграций Drizzle без `node:fs`.
 *
 * Идентичен читателю `drizzle-orm/migrator` по поведению: журнал задаёт
 * порядок миграций, каждый SQL-файл режется по `--> statement-breakpoint`.
 * Строки приходят через Vite `?raw`, поэтому работает в браузере (PGlite).
 */

export interface BrowserMigration {
  readonly tag: string;
  readonly sql: string[];
}

export function parseMigrationJournal(journalSource: string): readonly string[] {
  const journal = JSON.parse(journalSource) as { entries: ReadonlyArray<{ tag: string; }>; };
  return journal.entries.map((e) => e.tag);
}

export function parseMigrationSql(sqlSource: string): string[] {
  return sqlSource
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function collectMigrations(
  tags: readonly string[],
  sqlFor: ReadonlyMap<string, string>,
): BrowserMigration[] {
  return tags.map((tag) => {
    const source = sqlFor.get(tag);
    if (source === undefined) throw new Error(`нет SQL миграции «${tag}»`);
    return { tag, sql: parseMigrationSql(source) };
  });
}
/** Runs on both PGlite and its worker proxy; records each applied version. */
export async function migrateBrowser(
  db: Pick<import('@electric-sql/pglite').PGliteInterface, 'transaction'>,
  migrations: readonly BrowserMigration[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.exec(`CREATE TABLE IF NOT EXISTS _gymix_migrations (
      tag text PRIMARY KEY, source text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    let applied = (await tx.query<{ tag: string; source: string; }>('SELECT tag, source FROM _gymix_migrations')).rows;
    if (applied.length === 0 && migrations[0]) {
      const existing = await tx.query<{ exists: boolean; }>("SELECT to_regclass('public.exercises') IS NOT NULL AS exists");
      if (existing.rows[0]?.exists) {
        // Older client releases applied 0000 without any journal. Adopt that
        // baseline only if its entire schema exists; never reset user data.
        const required = ['users', 'devices', 'auth_sessions', 'email_codes', 'muscle_groups',
          'anatomical_tags', 'movement_patterns', 'exercises', 'exercise_muscles',
          'exercise_anatomical_tags', 'exercise_movement_patterns', 'equipment',
          'equipment_aliases', 'exercise_equipment', 'workout_types', 'workout_volumes',
          'workout_templates', 'template_exercises', 'workout_generations', 'user_excluded_exercises',
          'workout_sessions', 'session_exercises', 'session_sets', 'session_intervals',
          'body_weight_entries', 'sync_operations'];
        const tables = await tx.query<{ tablename: string; }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
        const found = new Set(tables.rows.map((r) => r.tablename));
        if (required.some((table) => !found.has(table))) throw new Error('Локальная схема неполна; данные сохранены, требуется восстановление');
        const baseline = migrations[0];
        await tx.query('INSERT INTO _gymix_migrations (tag, source) VALUES ($1, $2)', [baseline.tag, JSON.stringify(baseline.sql)]);
        applied = [{ tag: baseline.tag, source: JSON.stringify(baseline.sql) }];
      }
    }
    const byTag = new Map(migrations.map((m) => [m.tag, m]));
    for (const previous of applied) {
      const migration = byTag.get(previous.tag);
      if (!migration || JSON.stringify(migration.sql) !== previous.source) {
        throw new Error(`Версия локальной базы несовместима: ${previous.tag}`);
      }
    }
    const done = new Set(applied.map((m) => m.tag));
    for (const migration of migrations) {
      if (done.has(migration.tag)) continue;
      for (const statement of migration.sql) await tx.exec(statement);
      await tx.query('INSERT INTO _gymix_migrations (tag, source) VALUES ($1, $2)', [migration.tag, JSON.stringify(migration.sql)]);
    }
  });
}
