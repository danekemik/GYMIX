import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import { bootstrapLocalDb } from './bootstrap';

// All tabs share one leader. Migration and seed finish before clients can query.
worker({
  async init() {
    const pglite = new PGlite('idb://gymix');
    try {
      await pglite.waitReady;
      await bootstrapLocalDb(pglite);
      return pglite;
    } catch (error) {
      await pglite.close();
      throw error;
    }
  },
});
