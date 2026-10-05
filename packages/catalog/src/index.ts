import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogParseError, parseCatalog, type Catalog } from './parse.js';

/**
 * Каталог читается прямо из `reference/exercise_catalog_v1.md`, который
 * каноничен для перечня упражнений. Документация остаётся единственным
 * источником: дублировать 113 записей в коде не нужно.
 */
const CATALOG_PATH = fileURLToPath(
  new URL('../../../reference/exercise_catalog_v1.md', import.meta.url),
);

let cached: Catalog | undefined;

export function loadCatalog(): Catalog {
  if (cached === undefined) {
    const source = readFileSync(CATALOG_PATH, 'utf8');
    cached = parseCatalog(source);
  }
  return cached;
}

export function parseCatalogFile(path: string): Catalog {
  return parseCatalog(readFileSync(path, 'utf8'));
}

export { CatalogParseError, parseCatalog, matchesSlot } from './parse.js';
export type { Catalog, CatalogExercise } from './parse.js';