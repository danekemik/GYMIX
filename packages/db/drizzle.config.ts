import { defineConfig } from 'drizzle-kit';

/**
 * Миграции генерируются в `drizzle/` и применяются к PostgreSQL на сервере
 * и к PGlite в тестах: файлы SQL одинаковые для обоих окружений.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://localhost:5432/gymix',
  },
});
