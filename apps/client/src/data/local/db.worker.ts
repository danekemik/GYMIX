import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import { bootstrapLocalDb } from './bootstrap';

// All tabs share one leader. Migration and seed finish before clients can query.
worker({
  async init(options) {
    const accountId = options.meta?.accountId;
    if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) throw new Error('Не задан аккаунт локальной базы');
    const pglite = new PGlite(`idb://gymix-account-${accountId}`);
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
