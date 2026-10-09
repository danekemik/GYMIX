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
  const journal = JSON.parse(journalSource) as { entries: ReadonlyArray<{ tag: string }> };
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