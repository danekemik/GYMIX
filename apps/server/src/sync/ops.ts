import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@gymix/db/seed-data';
import {
  sessionExercises,
  sessionIntervals,
  sessionSets,
  syncOperations,
  workoutSessions,
} from '@gymix/db/schema';
import { HttpError, isHttpError, type ErrorCode } from '../errors.js';
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

export type { ExerciseStatus, Op, ApplyOpsResult } from '@gymix/contracts';
import { operationSchema, type Op, type ApplyOpsResult } from '@gymix/contracts';

export function parseOperation(value: unknown): Op {
  return operationSchema.parse(value) as Op;
}

export function parseOperations(value: unknown): Op[] {
  if (!Array.isArray(value)) {
    throw HttpError.invalidRequest('ops должен быть массивом операций');
  }
  if (value.length > 100) throw HttpError.invalidRequest('Не более 100 операций в пакете');
  return value.map(parseOperation);
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
    const opIds = input.operations.map((o) => o.operationId);
    const rows = opIds.length ? await tx.select().from(syncOperations)
      .where(and(eq(syncOperations.userId, input.userId), inArray(syncOperations.operationId, opIds))) : [];
    const known = new Map(rows.map((row) => [row.operationId, row]));
    // An operation ID identifies its payload too, not just a successful request.
    for (const op of input.operations) {
      const previous = known.get(op.operationId);
      if (previous && (previous.sessionId !== session.id || canonical(previous.payload) !== canonical(op))) {
        throw new HttpError(409, 'conflict', 'operationId уже использован для другой операции');
      }
    }
    const allKnown = input.operations.every((op) => known.has(op.operationId));
    if (!allKnown && baseRevision !== input.expectedRevision) {
      return {
        revision: baseRevision, applied: [], skipped: [], rejected: [], conflict: true,
        sessionStatus: session.status, owningDeviceId: session.owningDeviceId
      };
    }
    const applied: string[] = [];
    const skipped = new Set<string>();
    const rejected: Array<{ operationId: string; code: ErrorCode; message: string; }> = [];
    for (const op of input.operations) {
      const previous = known.get(op.operationId);
      if (previous) {
        if (canonical(previous.payload) !== canonical(op)) {
          rejected.push({ operationId: op.operationId, code: 'operation_rejected', message: 'operationId уже использован для другой операции' });
        } else skipped.add(op.operationId);
        continue;
      }
      try {
        // Each operation and its journal record share a savepoint. A rejected
        // operation leaves the remaining batch and the in-memory view intact.
        const recorded = await tx.transaction(async (opTx) => {
          const context = await loadContext(opTx, session.id, now, input.deviceId);
          if (context.session.status === 'active' && op.type !== 'transfer_ownership' &&
            context.session.owningDeviceId !== input.deviceId) {
            throw new HttpError(423, 'ownership_required', 'Тренировку ведёт другое устройство');
          }
          if (context.session.status === 'completed' &&
            !['set_upsert', 'exercise_status', 'exercise_position'].includes(op.type)) {
            throw HttpError.invalidRequest('Операция недоступна для завершённой тренировки');
          }
          await applyOne(opTx, op, context);
          const [row] = await opTx.insert(syncOperations).values({
            operationId: op.operationId,
            userId: input.userId, deviceId: input.deviceId, sessionId: session.id,
            payload: op as unknown as Record<string, unknown>
          }).returning();
          return row!;
        });
        known.set(op.operationId, recorded);
        applied.push(op.operationId);
      } catch (error) {
        if (!isHttpError(error)) throw error;
        rejected.push({ operationId: op.operationId, code: error.code === 'ownership_required' ? error.code : 'operation_rejected', message: error.message });
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
      skipped: [...skipped],
      rejected,
      conflict: false,
      sessionStatus: fresh[0]!.status,
      owningDeviceId: fresh[0]!.owningDeviceId,
    };
  });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function loadContext(db: Db, sessionId: string, now: Date, ownerDeviceId: string): Promise<ApplyContext> {
  const [session] = await db.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId));
  const entries = await db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId));
  const ids = entries.map((e) => e.id);
  const sets = ids.length ? await db.select().from(sessionSets).where(inArray(sessionSets.sessionExerciseId, ids)) : [];
  const setsByExercise = new Map<string, typeof sets>();
  for (const set of sets) {
    const list = setsByExercise.get(set.sessionExerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.sessionExerciseId, list);
  }
  return { session: session!, byId: new Map(entries.map((e) => [e.id, e])), setsByExercise, now, ownerDeviceId };
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
      if (!exercise) throw HttpError.invalidRequest('Упражнение не принадлежит тренировке');
      const set = ctx.setsByExercise
        .get(op.payload.sessionExerciseId)
        ?.find((s) => s.setNumber === op.payload.setNumber);
      if (!set) throw HttpError.invalidRequest(`Нет подхода №${op.payload.setNumber}`);
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
      if (Object.keys(patches).length === 0) throw HttpError.invalidRequest('Нет изменений подхода');
      await tx.update(sessionSets).set(patches).where(eq(sessionSets.id, set.id));
      return;
    }
    case 'set_add': {
      const exercise = ctx.byId.get(op.payload.sessionExerciseId);
      if (!exercise) throw HttpError.invalidRequest('Упражнение не принадлежит тренировке');
      const exists = ctx.setsByExercise
        .get(op.payload.sessionExerciseId)
        ?.some((s) => s.setNumber === op.payload.setNumber);
      if (!exists) {
        await tx.insert(sessionSets).values({
          sessionExerciseId: op.payload.sessionExerciseId,
          setNumber: op.payload.setNumber,
        }).onConflictDoNothing();
      }
      return;
    }
    case 'exercise_status': {
      const exercise = ctx.byId.get(op.payload.sessionExerciseId);
      if (!exercise) throw HttpError.invalidRequest('Упражнение не принадлежит тренировке');
      await tx
        .update(sessionExercises)
        .set({ status: op.payload.status })
        .where(eq(sessionExercises.id, exercise.id));
      return;
    }
    case 'exercise_position': {
      const exercise = ctx.byId.get(op.payload.sessionExerciseId);
      if (!exercise) throw HttpError.invalidRequest('Упражнение не принадлежит тренировке');
      if (op.payload.position > ctx.byId.size) throw HttpError.invalidRequest('Позиция вне тренировки');
      if (exercise.position === op.payload.position) return;
      const occupant = [...ctx.byId.values()].find(
        (e) => e.position === op.payload.position && e.id !== exercise.id,
      );
      if (occupant) {
        const temporary = Math.min(0, ...[...ctx.byId.values()].map((e) => e.position)) - 1;
        await tx.update(sessionExercises).set({ position: temporary }).where(eq(sessionExercises.id, exercise.id));
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
      await tx.insert(sessionIntervals).values({ sessionId: ctx.session.id }).onConflictDoNothing();
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
        throw HttpError.invalidRequest('Тренировка с нулём выполненных упражнений не засчитывается');
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
      const completedAt = op.payload.completedAt ? new Date(op.payload.completedAt) : ctx.now;
      if (completedAt < ctx.session.startedAt) throw HttpError.invalidRequest('Дата завершения раньше начала');
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