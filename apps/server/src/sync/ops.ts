import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@gymix/db/seed-data';
import {
  sessionExercises,
  sessionIntervals,
  sessionSets,
  sessionStatusEnum,
  sessionExerciseStatusEnum,
  syncOperations,
  workoutSessions,
} from '@gymix/db/schema';
import { HttpError, type ErrorCode } from '../errors.js';
import type { AppContext } from '../app.js';

/**
 * Движок синхронизации тренировки.
 *
 * Клиент отправляет пакет идемпотентных операций (operation_id),
 * сервер применяет их в одной транзакции и поднимает revision. Журнал
 * `sync_operations` хранит только применённые операции: повторная
 * отправка той же operation_id не бьёт по данным. Операции, отклонённые
 * сервером (нет подхода, не тот владелец, ноль выполненных упражнений),
 * в журнал НЕ пишутся — клиент держит их в очереди и повторяет после
 * разрешения конфликта.
 *
 * Владелец активной тренировки — ровно одно устройство. Мутирующие
 * операции принимаются только от него; `transfer_ownership` отдаёт
 * владение устройству-отправителю и принимается от любого устройства
 * пользователя.
 */

export type ExerciseStatus =
  (typeof sessionExerciseStatusEnum.enumValues)[number];

export interface OpBase {
  operationId: string;
  payload: Record<string, unknown>;
}

export type Op =
  | (OpBase & {
      type: 'set_upsert';
      payload: {
        sessionExerciseId: string;
        setNumber: number;
        weight?: number | string | null | undefined;
        reps?: number | null | undefined;
        completedAt?: string | null | undefined;
      };
    })
  | (OpBase & { type: 'set_add'; payload: { sessionExerciseId: string; setNumber: number } })
  | (OpBase & { type: 'exercise_status'; payload: { sessionExerciseId: string; status: ExerciseStatus } })
  | (OpBase & { type: 'exercise_position'; payload: { sessionExerciseId: string; position: number } })
  | (OpBase & { type: 'interval_open'; payload: Record<string, never> })
  | (OpBase & { type: 'interval_close'; payload: Record<string, never> })
  | (OpBase & { type: 'finish'; payload: { completedAt?: string | undefined } })
  | (OpBase & { type: 'transfer_ownership'; payload: Record<string, never> });

const uuid = z.string().uuid();

const opSchemas: Record<Op['type'], z.ZodType<Op>> = {
  set_upsert: z.object({
    type: z.literal('set_upsert'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      setNumber: z.number().int().positive(),
      weight: z.union([z.number(), z.string()]).nullable().optional(),
      reps: z.number().int().min(0).nullable().optional(),
      completedAt: z.string().datetime({ offset: true }).nullable().optional(),
    }),
  }),
  set_add: z.object({
    type: z.literal('set_add'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      setNumber: z.number().int().positive(),
    }),
  }),
  exercise_status: z.object({
    type: z.literal('exercise_status'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      status: z.enum(sessionExerciseStatusEnum.enumValues),
    }),
  }),
  exercise_position: z.object({
    type: z.literal('exercise_position'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      position: z.number().int().positive(),
    }),
  }),
  interval_open: z.object({
    type: z.literal('interval_open'),
    operationId: uuid,
    payload: z.object({}).strict(),
  }),
  interval_close: z.object({
    type: z.literal('interval_close'),
    operationId: uuid,
    payload: z.object({}).strict(),
  }),
  finish: z.object({
    type: z.literal('finish'),
    operationId: uuid,
    payload: z.object({
      completedAt: z.string().datetime({ offset: true }).optional(),
    }),
  }),
  transfer_ownership: z.object({
    type: z.literal('transfer_ownership'),
    operationId: uuid,
    payload: z.object({}).strict(),
  }),
};

export function parseOperation(value: unknown): Op {
  if (typeof value !== 'object' || value === null) {
    throw HttpError.invalidRequest('Операция должна быть объектом');
  }
  const type = (value as { type?: unknown }).type;
  const schema = typeof type === 'string' ? opSchemas[type as keyof typeof opSchemas] : undefined;
  if (!schema) {
    throw HttpError.invalidRequest(`Неизвестный тип операции: ${String(type)}`);
  }
  return schema.parse(value) as Op;
}

export function parseOperations(value: unknown): Op[] {
  if (!Array.isArray(value)) {
    throw HttpError.invalidRequest('ops должен быть массивом операций');
  }
  return value.map(parseOperation);
}

export interface ApplyOpsResult {
  revision: number;
  applied: string[];
  skipped: string[];
  rejected: Array<{ operationId: string; code: ErrorCode; message: string }>;
  conflict: boolean;
  sessionStatus: (typeof sessionStatusEnum.enumValues)[number];
  owningDeviceId: string;
}

export interface ApplyOpsInput {
  userId: string;
  deviceId: string;
  sessionId: string;
  expectedRevision: number;
  operations: Op[];
}

export async function applyOps(
  db: Db,
  ctx: AppContext,
  input: ApplyOpsInput,
): Promise<ApplyOpsResult> {
  const now = ctx.clock();

  // Пачка операций применяется атомарно: транзакция + FOR UPDATE сессии.
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(workoutSessions)
      .where(and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, input.userId)))
      .for('update');

    if (!session) {
      throw HttpError.notFound('Тренировка не найдена');
    }

    const baseRevision = session.revision;
    if (baseRevision !== input.expectedRevision) {
      return {
        revision: baseRevision,
        applied: [],
        skipped: [],
        rejected: [],
        conflict: true,
        sessionStatus: session.status,
        owningDeviceId: session.owningDeviceId,
      };
    }

    const exercisesOfSession = await tx
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, session.id));
    const byId = new Map(exercisesOfSession.map((e) => [e.id, e]));

    const exIds = [...byId.keys()];
    const sets = exIds.length
      ? await tx.select().from(sessionSets).where(inArray(sessionSets.sessionExerciseId, exIds))
      : [];
    const setsByExercise = new Map<string, Array<(typeof sets)[number]>>();
    for (const set of sets) {
      const list = setsByExercise.get(set.sessionExerciseId);
      if (list) list.push(set);
      else setsByExercise.set(set.sessionExerciseId, [set]);
    }

    const opIds = input.operations.map((o) => o.operationId);
    const known = opIds.length
      ? await tx
          .select({ operationId: syncOperations.operationId })
          .from(syncOperations)
          .where(
            and(
              eq(syncOperations.userId, input.userId),
              inArray(syncOperations.operationId, opIds),
            ),
          )
      : [];
    const knownIds = new Set(known.map((r) => r.operationId));

    const applied: string[] = [];
    const rejected: Array<{ operationId: string; code: ErrorCode; message: string }> = [];

    for (const op of input.operations) {
      if (knownIds.has(op.operationId)) continue;

      const ownershipOk =
        op.type === 'transfer_ownership' || session.owningDeviceId === input.deviceId;
      if (!ownershipOk) {
        rejected.push({
          operationId: op.operationId,
          code: 'ownership_required',
          message: 'Тренировку ведёт другое устройство',
        });
        continue;
      }

      try {
        await applyOne(tx, op, {
          session,
          byId,
          setsByExercise,
          now,
          ownerDeviceId: input.deviceId,
        });
        applied.push(op.operationId);
        await tx.insert(syncOperations).values({
          operationId: op.operationId,
          userId: input.userId,
          deviceId: input.deviceId,
          sessionId: session.id,
          payload: op as unknown as Record<string, unknown>,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          // interval_open / set_add уже состоялись: повторяемость без вреда.
          applied.push(op.operationId);
          continue;
        }
        rejected.push({
          operationId: op.operationId,
          code: 'operation_rejected',
          message: error instanceof Error ? error.message : 'Операция отклонена',
        });
      }
    }

    let revision = baseRevision;
    if (applied.length > 0) {
      revision = baseRevision + 1;
      await tx
        .update(workoutSessions)
        .set({ revision, updatedAt: now })
        .where(eq(workoutSessions.id, session.id));
    }

    const fresh = await tx
      .select({
        status: workoutSessions.status,
        owningDeviceId: workoutSessions.owningDeviceId,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, session.id));

    return {
      revision,
      applied,
      skipped: [...knownIds],
      rejected,
      conflict: false,
      sessionStatus: fresh[0]!.status,
      owningDeviceId: fresh[0]!.owningDeviceId,
    };
  });
}

function isUniqueViolation(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error);
  const cause = (error as { cause?: unknown }).cause;
  const causeText = cause instanceof Error ? cause.message : '';
  return /duplicate key|unique constraint/i.test(`${message} ${causeText}`);
}

interface ApplyContext {
  session: typeof workoutSessions.$inferSelect;
  byId: ReadonlyMap<string, typeof sessionExercises.$inferSelect>;
  setsByExercise: ReadonlyMap<
    string,
    ReadonlyArray<typeof sessionSets.$inferSelect>
  >;
  now: Date;
  /** Устройство-отправитель: onto владения для transfer_ownership. */
  ownerDeviceId: string;
}

async function applyOne(tx: Db, op: Op, ctx: ApplyContext): Promise<void> {
  switch (op.type) {
    case 'set_upsert': {
      const exercise = ctx.byId.get(op.payload.sessionExerciseId);
      if (!exercise) throw new Error('Упражнение не принадлежит тренировке');
      const set = ctx.setsByExercise
        .get(op.payload.sessionExerciseId)
        ?.find((s) => s.setNumber === op.payload.setNumber);
      if (!set) throw new Error(`Нет подхода №${op.payload.setNumber}`);
      const patches = defined({
        weight:
          op.payload.weight === undefined
            ? undefined
            : op.payload.weight === null
              ? null
              : String(op.payload.weight),
        reps: op.payload.reps === undefined ? undefined : op.payload.reps,
        completedAt:
          op.payload.completedAt === undefined
            ? undefined
            : op.payload.completedAt === null
              ? null
              : new Date(op.payload.completedAt),
      });
      await tx.update(sessionSets).set(patches).where(eq(sessionSets.id, set.id));
      return;
    }
    case 'set_add': {
      const exercise = ctx.byId.get(op.payload.sessionExerciseId);
      if (!exercise) throw new Error('Упражнение не принадлежит тренировке');
      const exists = ctx.setsByExercise
        .get(op.payload.sessionExerciseId)
        ?.some((s) => s.setNumber === op.payload.setNumber);
      if (!exists) {
        await tx.insert(sessionSets).values({
          sessionExerciseId: op.payload.sessionExerciseId,
          setNumber: op.payload.setNumber,
        });
      }
      return;
    }
    case 'exercise_status': {
      const exercise = ctx.byId.get(op.payload.sessionExerciseId);
      if (!exercise) throw new Error('Упражнение не принадлежит тренировке');
      await tx
        .update(sessionExercises)
        .set({ status: op.payload.status })
        .where(eq(sessionExercises.id, exercise.id));
      return;
    }
    case 'exercise_position': {
      const exercise = ctx.byId.get(op.payload.sessionExerciseId);
      if (!exercise) throw new Error('Упражнение не принадлежит тренировке');
      if (exercise.position === op.payload.position) return;
      const occupant = [...ctx.byId.values()].find(
        (e) => e.position === op.payload.position && e.id !== exercise.id,
      );
      if (occupant) {
        await tx
          .update(sessionExercises)
          .set({ position: exercise.position })
          .where(eq(sessionExercises.id, occupant.id));
      }
      await tx
        .update(sessionExercises)
        .set({ position: op.payload.position })
        .where(eq(sessionExercises.id, exercise.id));
      return;
    }
    case 'interval_open': {
      await tx.insert(sessionIntervals).values({ sessionId: ctx.session.id });
      return;
    }
    case 'interval_close': {
      await tx
        .update(sessionIntervals)
        .set({ endedAt: ctx.now })
        .where(
          and(
            eq(sessionIntervals.sessionId, ctx.session.id),
            sql`${sessionIntervals.endedAt} IS NULL`,
          ),
        );
      return;
    }
    case 'finish': {
      const completedCount = [...ctx.byId.values()].filter(
        (e) => e.status === 'completed',
      ).length;
      if (completedCount === 0) {
        throw new Error('Тренировка с нулём выполненных упражнений не засчитывается');
      }
      await tx
        .update(sessionIntervals)
        .set({ endedAt: ctx.now })
        .where(
          and(
            eq(sessionIntervals.sessionId, ctx.session.id),
            sql`${sessionIntervals.endedAt} IS NULL`,
          ),
        );
      const completedAt = op.payload.completedAt
        ? new Date(op.payload.completedAt)
        : ctx.now;
      await tx
        .update(workoutSessions)
        .set({ status: 'completed', completedAt })
        .where(eq(workoutSessions.id, ctx.session.id));
      return;
    }
    case 'transfer_ownership': {
      await tx
        .update(workoutSessions)
        .set({ owningDeviceId: ctx.ownerDeviceId })
        .where(eq(workoutSessions.id, ctx.session.id));
      return;
    }
  }
}

/**
 * Объект только из реально заданных ключей: иначе дризл проставляет
 * undefined в колонку (строгие exactOptionalPropertyTypes).
 */
function defined<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]-?: T[K] } {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as { [K in keyof T]-?: T[K] };
}

export function conflictError(result: ApplyOpsResult): ErrorCode {
  return result.conflict ? 'session_conflict' : 'operation_rejected';
}