import { defineConfig } from 'tsup';

/**
 * Сервер собирается в один ESM-бандл. Рабочие пакеты (@gymix/*) читают
 * справочники с диска по `import.meta.url`, поэтому их нужно не
 * экстернализовать, а вшить в бандл (noExternal). Системные зависимости
 * (hono, pg, drizzle-orm, pino, ...) остаются в node_modules образа.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  bundle: true,
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  noExternal: [/@gymix\//],
  external: [
    'pg-native',
    '@electric-sql/pglite',
    'drizzle-orm/pglite',
  ],
});