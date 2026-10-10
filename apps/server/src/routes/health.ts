import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { pingDb } from '../db.js';

export function healthRouter(ctx: AppContext): Hono {
  const app = new Hono();

  app.get('/healthz', async (c) => {
    const dbOk = await pingDb(ctx.db);
    const status = dbOk ? 'ok' : 'degraded';
    return c.json({
      status,
      db: dbOk,
      time: ctx.clock().toISOString(),
    }, dbOk ? 200 : 503);
  });

  return app;
}