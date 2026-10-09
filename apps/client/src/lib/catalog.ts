import { parseCatalog, type Catalog } from '@gymix/catalog/parse';
import catalogSource from '../../../../reference/exercise_catalog_v1.md?raw';

/**
 * Каталог упражнений в браузере: тот же markdown-источник, что засеивается
 * в PGlite, но разобранный напрямую в память — генератору нужен объект
 * `Catalog`, а не строки БД. Парсинг один раз на страницу.
 */
let cached: Catalog | undefined;

export function getCatalog(): Catalog {
  if (cached === undefined) cached = parseCatalog(catalogSource);
  return cached;
}
