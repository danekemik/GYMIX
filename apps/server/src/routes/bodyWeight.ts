import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { bodyWeightEntries } from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { getPrincipal, requireAuth } from '../auth-mid.js';
import { readJson } from '../web.js';

/**
 * Вес тела. Одна запись на календарный день (unique по user + day):
 * повторная отправка за тот же день обновляет значение.
 */

export function bodyWeightRouter(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('*', requireAuth(ctx));

  app.get('/body-weight', async (c) => {
    const { userId } = getPrincipal(c);
    const rows = await ctx.db
      .select()
      .from(bodyWeightEntries)
      .where(eq(bodyWeightEntries.userId, userId))
      .orderBy(asc(bodyWeightEntries.measuredAt));
    return c.json({
      entries: rows.map((row) => ({
        id: row.id,
        measuredAt: row.measuredAt,
        value: String(row.value),
        unit: row.unit,
      })),
    });
  });

  app.post('/body-weight', async (c) => {
    const { userId } = getPrincipal(c);
    const body = z
      .object({
        measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата вида ГГГГ-ММ-ДД'),
        value: z.coerce.number().positive().max(999),
        unit: z.enum(['kg', 'lb']).default('kg'),
      })
      .parse(await readJson(c));

    const existing = await ctx.db
      .select({ id: bodyWeightEntries.id })
      .from(bodyWeightEntries)
      .where(
        and(
          eq(bodyWeightEntries.userId, userId),
          eq(bodyWeightEntries.measuredAt, body.measuredAt),
        ),
      )
      .limit(1);

    let row;
    if (existing[0]) {
      const [updated] = await ctx.db
        .update(bodyWeightEntries)
        .set({ value: body.value.toFixed(2), unit: body.unit })
        .where(eq(bodyWeightEntries.id, existing[0].id))
        .returning();
      row = updated;
    } else {
      const [inserted] = await ctx.db
        .insert(bodyWeightEntries)
        .values({
          userId,
          measuredAt: body.measuredAt,
          value: body.value.toFixed(2),
          unit: body.unit,
        })
        .returning();
      row = inserted;
    }

    return c.json({
      entry: {
        id: row!.id,
        measuredAt: row!.measuredAt,
        value: String(row!.value),
        unit: row!.unit,
      },
    });
  });

  return app;
}