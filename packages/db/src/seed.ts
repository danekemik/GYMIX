import { loadCatalog } from '@gymix/catalog';
import { loadReference } from './reference.js';
import { seedFromData, type Db, type SeedCounts } from './seed-data.js';

/**
 * Node-обёртка: читает каталог и reference с диска и передаёт
 * распарсенные данные в чистый `seedFromData`.
 */
export async function seed(db: Db): Promise<SeedCounts> {
  return seedFromData(db, loadCatalog(), loadReference());
}

export { seedFromData } from './seed-data.js';
export type { Db, SeedCounts } from './seed-data.js';