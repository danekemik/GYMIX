import { Hono } from 'hono';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@gymix/db/seed-data';
import {
  exercises,
  sessionExercises,
  sessionIntervals,
  sessionSets,
  workoutSessions,
  workoutTemplates,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { HttpError } from '../errors.js';
import { getPrincipal, requireAuth } from '../auth-mid.js';
import { readJson } from '../web.js';
import { applyOps, parseOperations } from '../sync/ops.js';
import { getSessionSnapshot } from '../sync/snapshot.js';
import { operationBatchSchema } from '@gymix/contracts';
import { VOLUME_LEVELS, WORKOUT_TYPES } from '@gymix/structures';

const TYPE_KEYS = new Set<string>(WORKOUT_TYPES);
const VOLUME_KEYS = new Set<string>(VOLUME_LEVELS);

export function workoutsRouter(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('/workouts', requireAuth(ctx));
  app.use('/workouts/*', requireAuth(ctx));

  app.post('/workouts', async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const body = z
      .object({
        type: z.string().min(1),
        volume: z.string().min(1),
        sourceTemplateId: z.string().uuid().optional(),
        exercises: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              position: z.number().int().positive(),
              defaultSets: z.number().int().positive().max(20).default(3),
            }),
          )
          .nonempty(),
        startedAt: z.string().datetime({ offset: true }).optional(),
      })
      .parse(await readJson(c));

    const id = await createSession(ctx, userId, deviceId, {
      type: body.type,
      volume: body.volume,
      exercises: body.exercises,
      ...(body.sourceTemplateId !== undefined
        ? { sourceTemplateId: body.sourceTemplateId }
        : {}),
      ...(body.startedAt !== undefined ? { startedAt: body.startedAt } : {}),
    });
    const snapshot = await getSessionSnapshot(ctx.db, id, deviceId, ctx.clock);
    return c.json({ session: snapshot }, 201);
  });

  app.get('/workouts', async (c) => {
    const { userId } = getPrincipal(c);
    const limit = z.coerce.number().int().min(1).max(100).parse(c.req.query('limit') ?? '20');
    let cursor: { completedAt: string; id: string; } | undefined;
    const raw = c.req.query('cursor');
    if (raw) {
      try {
        if (raw.length > 300) throw new Error();
        cursor = z.object({ completedAt: z.string().datetime(), id: z.string().uuid() })
          .parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
      } catch { throw HttpError.invalidRequest('Некорректный курсор истории'); }
    }
    const rows = await ctx.db.select({
      id: workoutSessions.id, type: workoutTypes.key, volume: workoutVolumes.key,
      startedAt: workoutSessions.startedAt, completedAt: workoutSessions.completedAt,
      revision: workoutSessions.revision,
      done: sql<number>`count(${sessionExercises.id}) filter (where ${sessionExercises.status} = 'completed')::int`,
      total: sql<number>`count(${sessionExercises.id})::int`,
    }).from(workoutSessions)
      .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
      .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
      .leftJoin(sessionExercises, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, 'completed'),
        cursor ? or(lt(workoutSessions.completedAt, new Date(cursor.completedAt)),
          and(eq(workoutSessions.completedAt, new Date(cursor.completedAt)), lt(workoutSessions.id, cursor.id))) : undefined))
      .groupBy(workoutSessions.id, workoutTypes.key, workoutVolumes.key)
      .orderBy(desc(workoutSessions.completedAt), desc(workoutSessions.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor = rows.length > limit && last?.completedAt
      ? Buffer.from(JSON.stringify({ completedAt: last.completedAt.toISOString(), id: last.id })).toString('base64url') : null;
    return c.json({ history: page, nextCursor });
  });

  app.get('/workouts/active', async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const rows = await ctx.db
      .select({
        id: workoutSessions.id,
        status: workoutSessions.status,
        startedAt: workoutSessions.startedAt,
        revision: workoutSessions.revision,
        owningDeviceId: workoutSessions.owningDeviceId,
        type: workoutTypes.key,
        volume: workoutVolumes.key,
        sourceTemplateId: workoutSessions.sourceTemplateId,
        exerciseCount: sql<number>`count(distinct ${sessionExercises.id})::int`,
      })
      .from(workoutSessions)
      .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
      .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
      .leftJoin(sessionExercises, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.status, 'active'),
        ),
      )
      .groupBy(workoutSessions.id, workoutTypes.key, workoutVolumes.key)
      .orderBy(workoutSessions.startedAt);

    return c.json({
      active: rows.map((r) => ({
        id: r.id,
        type: r.type,
        volume: r.volume,
        startedAt: r.startedAt.toISOString(),
        status: r.status,
        revision: r.revision,
        sourceTemplateId: r.sourceTemplateId,
        owningDeviceId: r.owningDeviceId,
        readOnly: r.owningDeviceId !== deviceId,
        exerciseCount: r.exerciseCount,
      })),
    });
  });

  app.get('/workouts/:id', async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    await findSession(ctx.db, requireUuid(c.req.param('id')), userId);
    const snapshot = await getSessionSnapshot(
      ctx.db,
      requireUuid(c.req.param('id')),
      deviceId,
      ctx.clock,
    );
    return c.json({ session: snapshot });
  });

  app.post('/workouts/:id/ops', async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const sessionId = requireUuid(c.req.param('id'));
    const body = operationBatchSchema.parse(await readJson(c));
    const response = await ctx.db.transaction(async (tx) => {
      const result = await applyOps(tx, ctx, {
        userId, deviceId, sessionId,
        expectedRevision: body.expectedRevision, operations: parseOperations(body.ops)
      });
      const snapshot = await getSessionSnapshot(tx, sessionId, deviceId, ctx.clock);
      return { result, session: snapshot };
    });
    return c.json(response);
  });

  app.delete('/workouts/:id', async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const sessionId = requireUuid(c.req.param('id'));
    await ctx.db.transaction(async (tx) => {
      const session = await lockedSession(tx, sessionId, userId, deviceId);
      if (session.status !== 'active') throw new HttpError(409, 'conflict', 'Завершённую тренировку удалить нельзя');
      await tx.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
    });
    return c.body(null, 204);
  });

  app.patch('/workouts/:id', async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const sessionId = requireUuid(c.req.param('id'));
    const body = z
      .object({
        expectedRevision: z.number().int().positive(),
        startedAt: z.string().datetime({ offset: true }).optional(),
        completedAt: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(await readJson(c));

    const snapshot = await ctx.db.transaction(async (tx) => {
      const session = await lockedSession(tx, sessionId, userId, deviceId);
      if (session.revision !== body.expectedRevision) throw new HttpError(409, 'session_conflict', 'Тренировка уже изменена, обновите данные');
      const startedAt = body.startedAt ? new Date(body.startedAt) : session.startedAt;
      const completedAt = body.completedAt === undefined ? session.completedAt : body.completedAt === null ? null : new Date(body.completedAt);
      if (session.status === 'completed' && !completedAt) throw HttpError.invalidRequest('У завершённой тренировки должна быть дата завершения');
      if (session.status === 'active' && completedAt) throw HttpError.invalidRequest('Для завершения используйте операцию finish');
      if (completedAt && completedAt < startedAt) throw HttpError.invalidRequest('Дата завершения раньше начала');
      await tx.update(workoutSessions).set({ startedAt, completedAt, updatedAt: ctx.clock(), revision: session.revision + 1 })
        .where(eq(workoutSessions.id, sessionId));
      return getSessionSnapshot(tx, sessionId, deviceId, ctx.clock);
    });
    return c.json({ session: snapshot });
  });

  return app;
}

/**
 * Старт тренировки: сессия + снимки упражнений + по `defaultSets` пустых
 * подходов + открытый интервал таймера. Имена упражнений разрешаются в
 * каноничный каталог; фактическое название сохраняется снимком (LOCKED).
 */
export async function createSession(
  ctx: AppContext,
  userId: string,
  deviceId: string,
  input: {
    type: string;
    volume: string;
    sourceTemplateId?: string;
    exercises: Array<{ name: string; position: number; defaultSets: number; }>;
    startedAt?: string;
  },
): Promise<string> {
  if (!TYPE_KEYS.has(input.type)) {
    throw HttpError.invalidRequest(`Неизвестный тип тренировки: ${input.type}`);
  }
  if (!VOLUME_KEYS.has(input.volume)) {
    throw HttpError.invalidRequest(`Неизвестный объём: ${input.volume}`);
  }
  if (input.exercises.length === 0) {
    throw HttpError.invalidRequest('В тренировке нет упражнений');
  }
  if (input.exercises.length > 60) {
    throw HttpError.invalidRequest('Слишком много упражнений');
  }

  if (input.sourceTemplateId) {
    await assertOwnTemplate(ctx.db, userId, input.sourceTemplateId);
  }

  return ctx.db.transaction(async (tx) => {
    const [type] = await tx
      .select({ id: workoutTypes.id })
      .from(workoutTypes)
      .where(eq(workoutTypes.key, input.type));
    const [volume] = await tx
      .select({ id: workoutVolumes.id })
      .from(workoutVolumes)
      .where(eq(workoutVolumes.key, input.volume));
    if (!type || !volume) {
      throw HttpError.invalidRequest('Тип или объём тренировки не найден');
    }

    const names = input.exercises.map((e) => e.name);
    const catalog = await tx
      .select({ id: exercises.id, name: exercises.canonicalNameRu })
      .from(exercises)
      .where(inArray(exercises.canonicalNameRu, names));
    const byName = new Map(catalog.map((e) => [e.name, e.id]));
    const unknown = names.filter((name) => !byName.has(name));
    if (unknown.length > 0) {
      throw new HttpError(
        400,
        'unknown_exercise',
        `Неизвестные упражнения: ${unknown.join(', ')}`,
      );
    }
    const positions = input.exercises.map((e) => e.position);
    if (new Set(positions).size !== positions.length) {
      throw HttpError.invalidRequest('Позиции упражнений не должны повторяться');
    }

    const insert: typeof workoutSessions.$inferInsert = {
      userId,
      owningDeviceId: deviceId,
      typeId: type.id,
      volumeId: volume.id,
    };
    if (input.sourceTemplateId) insert.sourceTemplateId = input.sourceTemplateId;
    if (input.startedAt) insert.startedAt = new Date(input.startedAt);

    const [session] = await tx.insert(workoutSessions).values(insert).returning();
    const sessionId = session!.id;

    const rows = await tx
      .insert(sessionExercises)
      .values(
        input.exercises.map((e) => ({
          sessionId,
          exerciseId: byName.get(e.name)!,
          exerciseNameSnapshot: e.name,
          position: e.position,
        })),
      )
      .returning({ id: sessionExercises.id });
    const exerciseIdByPosition = new Map(
      rows.map((row, index) => [input.exercises[index]!.position, row.id]),
    );

    const setRows = input.exercises.flatMap((exercise) => {
      const sessionExerciseId = exerciseIdByPosition.get(exercise.position)!;
      return Array.from({ length: exercise.defaultSets }, (_, index) => ({
        sessionExerciseId,
        setNumber: index + 1,
      }));
    });
    await tx.insert(sessionSets).values(setRows);

    await tx.insert(sessionIntervals).values({ sessionId });
    return sessionId;
  });
}

async function assertOwnTemplate(db: Db, userId: string, templateId: string): Promise<void> {
  const [template] = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(
      and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)),
    );
  if (!template) throw HttpError.notFound('Шаблон не найден');
}

async function findSession(
  db: Db,
  sessionId: string,
  userId: string,
): Promise<{ id: string; status: 'active' | 'completed'; }> {
  const [row] = await db
    .select({ id: workoutSessions.id, status: workoutSessions.status })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
  if (!row) throw HttpError.notFound('Тренировка не найдена');
  return row;
}

async function lockedSession(db: Db, sessionId: string, userId: string, deviceId: string) {
  const [session] = await db.select().from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId))).for('update');
  if (!session) throw HttpError.notFound('Тренировка не найдена');
  if (session.status === 'active' && session.owningDeviceId !== deviceId) {
    throw new HttpError(423, 'ownership_required', 'Тренировку ведёт другое устройство');
  }
  return session;
}

function requireUuid(value: string): string {
  if (!z.string().uuid().safeParse(value).success) {
    throw HttpError.notFound();
  }
  return value;
}