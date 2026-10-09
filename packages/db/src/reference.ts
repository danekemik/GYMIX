import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseReference, type Reference } from './parse.js';

/**
 * Node-обёртка: читает `reference/exercise_database.md` с диска.
 * Собственно парсинг живёт в `./parse.ts` (чистый, без `node:fs`),
 * поэтому браузер может вызвать `parseReference` напрямую со строкой.
 */
const REFERENCE_PATH = fileURLToPath(
  new URL('../../../reference/exercise_database.md', import.meta.url),
);

let cached: Reference | undefined;

export function loadReference(): Reference {
  if (cached === undefined) {
    cached = parseReference(readFileSync(REFERENCE_PATH, 'utf8'));
  }
  return cached;
}

export { parseReference, resolveEquipmentLabel } from './parse.js';
export type { Reference } from './parse.js';
export { ReferenceParseError } from './parse.js';