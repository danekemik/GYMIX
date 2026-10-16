import { Hono } from 'hono';
import { and, eq, gte, inArray } from 'drizzle-orm';
import {
  sessionExercises,
  sessionSets,
  workoutSessions,
} from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { getPrincipal, requireAuth } from '../auth-mid.js';

/**
 * Динамика прогресса. «Точка графика = лучший подход тренировки»
 * (LOCKED): по каждому упражнению за каждую завершённую тренировку
 * берётся подход с максимальным весом, при равенстве — с большим числом
 * повторений. Оценочный 1ПМ не считается.
 */

export function progressRouter(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('/progress', requireAuth(ctx));
  app.use('/progress/*', requireAuth(ctx));

  app.get('/progress', async (c) => {
    const { userId } = getPrincipal(c);
    const monthsRaw = Number(c.req.query('months') ?? '6');
    const months = Number.isFinite(monthsRaw) ? Math.max(1, Math.min(24, Math.trunc(monthsRaw))) : 6;

    const since = new Date(ctx.clock().getTime() - months * 30 * 86_400_000);

    const sessions = await ctx.db
      .select({
        id: workoutSessions.id,
        startedAt: workoutSessions.startedAt,
      })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.status, 'completed'),
          gte(workoutSessions.startedAt, since),
        ),
      )
      .orderBy(workoutSessions.startedAt);

    if (sessions.length === 0) {
      return c.json({ series: [], months });
    }

    const sessionIds = sessions.map((s) => s.id);
    const exercisesOfSessions = await ctx.db
      .select()
      .from(sessionExercises)
      .where(and(inArray(sessionExercises.sessionId, sessionIds), eq(sessionExercises.status, 'completed')));

    const exIds = exercisesOfSessions.map((e) => e.id);
    const sets = exIds.length
      ? await ctx.db
        .select()
        .from(sessionSets)
        .where(inArray(sessionSets.sessionExerciseId, exIds))
      : [];

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const setsBySessionExercise = new Map<string, Array<(typeof sets)[number]>>();
    for (const set of sets) {
      const list = setsBySessionExercise.get(set.sessionExerciseId);
      if (list) list.push(set);
      else setsBySessionExercise.set(set.sessionExerciseId, [set]);
    }

    const byExercise = new Map<
      string,
      {
        exerciseId: string | null;
        name: string;
        points: Array<{ date: string; weightKg: string; reps: number; sessionId: string; }>;
      }
    >();

    for (const exercise of exercisesOfSessions) {
      const best = bestOfSets(setsBySessionExercise.get(exercise.id) ?? []);
      if (!best) continue;
      const session = sessionById.get(exercise.sessionId);
      if (!session) continue;
      const key = exercise.exerciseId ?? exercise.exerciseNameSnapshot;
      let entry = byExercise.get(key);
      if (!entry) {
        entry = { exerciseId: exercise.exerciseId, name: exercise.exerciseNameSnapshot, points: [] };
        byExercise.set(key, entry);
      }
      entry.exerciseId ??= exercise.exerciseId;
      entry.points.push({
        date: dateOnly(session.startedAt),
        weightKg: String(best.weight),
        reps: best.reps!,
        sessionId: session.id,
      });
    }

    const series = [...byExercise.values()]
      .map(({ exerciseId, name, points }) => ({
        exerciseId,
        exerciseName: name,
        points: points.sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

    return c.json({ series, months });
  });

  return app;
}

function bestOfSets(
  sets: Array<typeof sessionSets.$inferSelect>,
): (typeof sessionSets.$inferSelect) | null {
  return (
    sets
      .filter((set) => set.completedAt !== null && set.weight !== null && set.reps !== null)
      .sort((a, b) => {
        const diff = Number(b.weight) - Number(a.weight);
        return diff !== 0 ? diff : (b.reps ?? 0) - (a.reps ?? 0) || a.setNumber - b.setNumber;
      })[0] ?? null
  );
}

function dateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
