import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { exercises, userExcludedExercises } from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { HttpError } from '../errors.js';
import { getPrincipal, requireAuth } from '../auth-mid.js';
import { readJson } from '../web.js';

/**
 * Исключённые упражнения: не предлагать в генерации. Пользователь
 * управляет полным набором (замена), поэтому PUT заменяет список целиком.
 */

export function exclusionsRouter(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('/exclusions', requireAuth(ctx));
  app.use('/exclusions/*', requireAuth(ctx));

  app.get('/exclusions', async (c) => {
    const { userId } = getPrincipal(c);
    return c.json({ excluded: await listExclusions(ctx, userId) });
  });

  app.put('/exclusions', async (c) => {
    const { userId } = getPrincipal(c);
    const body = z
      .object({ excludedNames: z.array(z.string().min(1).max(120)).max(500) })
      .parse(await readJson(c));

    const unique = [...new Set(body.excludedNames)];
    const rows = await ctx.db
      .select({ id: exercises.id, name: exercises.canonicalNameRu })
      .from(exercises)
      .where(inArray(exercises.canonicalNameRu, unique));
    const byName = new Map(rows.map((r) => [r.name, r.id]));
    const unknown = unique.filter((name) => !byName.has(name));
    if (unknown.length > 0) {
      throw new HttpError(400, 'unknown_exercise', `Неизвестные упражнения: ${unknown.join(', ')}`);
    }

    await ctx.db.transaction(async (tx) => {
      await tx.delete(userExcludedExercises).where(eq(userExcludedExercises.userId, userId));
      if (unique.length > 0) {
        await tx.insert(userExcludedExercises).values(
          unique.map((name) => ({ userId, exerciseId: byName.get(name)! })),
        );
      }
    });

    return c.json({ excluded: await listExclusions(ctx, userId) });
  });

  return app;
}

export async function listExclusions(
  ctx: AppContext,
  userId: string,
): Promise<Array<{ exerciseId: string; name: string; }>> {
  const rows = await ctx.db
    .select({
      exerciseId: userExcludedExercises.exerciseId,
      name: exercises.canonicalNameRu,
    })
    .from(userExcludedExercises)
    .innerJoin(exercises, eq(exercises.id, userExcludedExercises.exerciseId))
    .where(eq(userExcludedExercises.userId, userId))
    .orderBy(exercises.canonicalNameRu);
  return rows;
}