import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { syncChangeSchema } from '@gymix/contracts';
import { entityKeys } from '@gymix/db/sync-data';
import { users } from '@gymix/db/schema';
import { applyAccountChange, readRecord } from '../sync/account.js';
import type { AppContext } from '../app.js';
import { requireAuth, getPrincipal } from '../auth-mid.js';
import { readJson } from '../web.js';
import { HttpError } from '../errors.js';
export function syncRouter(ctx: AppContext) {
  const app = new Hono(); app.use('/sync/*', requireAuth(ctx));
  app.get('/sync/snapshot', async (c) => {
    const { userId } = getPrincipal(c);
    const records = await ctx.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user || user.deletedAt) throw HttpError.unauthorized();
      const keys = await entityKeys(tx, userId);
      return Promise.all(keys.map(key => readRecord(tx, userId, key)));
    }, { isolationLevel: 'repeatable read' });
    return c.json({ userId, records });
  });
  app.post('/sync/change', async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const change = syncChangeSchema.parse(await readJson(c));
    return c.json(await applyAccountChange(ctx.db, userId, deviceId, change));
  });
  return app;
}
