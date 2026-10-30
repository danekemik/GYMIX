import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { authSessions, devices, emailCodes, users } from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { getPrincipal, requireAuth } from '../auth-mid.js';
import { toPublicUser } from '../auth/service.js';
import { HttpError } from '../errors.js';
import { buildExport } from '../export-data.js';

/**
 * Профиль, выгрузка данных и удаление аккаунта. Удаление мягкое:
 * grace-период 7 дней, повторная регистрация на тот же email восстанавливает
 * аккаунт, финальное стирание делает фоновая задача.
 */

export const GRACE_PERIOD_MS = 7 * 86_400_000;

export function accountRouter(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('/account', requireAuth(ctx));
  app.use('/account/*', requireAuth(ctx));

  app.get('/account', async (c) => {
    const { userId } = getPrincipal(c);
    const [user] = await ctx.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw HttpError.notFound('Пользователь не найден');
    const deviceRows = await ctx.db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
    return c.json({
      user: toPublicUser(user),
      deviceCount: deviceRows.length,
    });
  });

  app.get('/account/export', async (c) => {
    const { userId } = getPrincipal(c);
    const payload = await buildExport(ctx, userId);
    const filename = `gymix-export-${payload.exportedAt.slice(0, 10)}.json`;
    const body = JSON.stringify(payload, null, 2);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  });

  app.delete('/account', async (c) => {
    const { userId } = getPrincipal(c);
    const now = ctx.clock();
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(users.id, userId));
      await tx.update(emailCodes).set({ consumedAt: now }).where(eq(emailCodes.userId, userId));
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
    });
    return c.json({
      ok: true,
      deletedAt: now.toISOString(),
      deletableUntil: new Date(now.getTime() + GRACE_PERIOD_MS).toISOString(),
    });
  });

  return app;
}