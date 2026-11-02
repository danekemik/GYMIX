import type { PGlite, PGliteInterface } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

/** Drizzle 0.45 types require the concrete class; its runtime driver only
 * uses the PGlite query/transaction interface, also implemented by the worker. */
export function localDrizzle(client: PGliteInterface) {
  return drizzle({ client: client as PGlite });
}
