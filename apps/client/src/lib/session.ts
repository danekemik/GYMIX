import { localChange, workoutReadOnly } from '../data/sync/store';
import { runSessionCommand } from '../data/local/read-rpc';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { repsValue, validSetInput, weightValue } from '../domain/setInput';
import type { GeneratedWorkout } from '@gymix/generator';
import {
  devices,
  exercises,
  sessionExercises,
  sessionIntervals,
  sessionSets,
  users,
  workoutSessions,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import type { SessionSnapshot, SetEntry } from '../domain/session';
import type { GymixDb } from './db';
import { buildWorkoutFromEntries } from './reconstruct';

export interface HistoryItem {
  readonly id: string;
  readonly type: string;
  readonly volume: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly done: number;
  readonly total: number;
}


/**
 * Снимок завершённой тренировки в историю. Пустая сессия сюда не доходит —
 * LOCKED (2026-10-05) блокирует финиш при 0 выполненных упражнений.
 */
async function _saveSession(db: GymixDb, payload: SessionSnapshot): Promise<string> {
  const owner = await ensureLocalOwner(db);

  return db.db.transaction(async (tx) => {
    const typeId = (
      await tx
        .select({ id: workoutTypes.id })
        .from(workoutTypes)
        .where(eq(workoutTypes.key, payload.workout.type))
        .limit(1)
    )[0]?.id;
    const volumeId = (
      await tx
        .select({ id: workoutVolumes.id })
        .from(workoutVolumes)
        .where(eq(workoutVolumes.key, payload.workout.volume))
        .limit(1)
    )[0]?.id;
    if (typeId === undefined || volumeId === undefined) {
      throw new Error(`нет справочника тип/объём для ${payload.workout.type} · ${payload.workout.volume}`);
    }

    const endedAt = new Date(payload.endedAt);
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        userId: owner.userId,
        owningDeviceId: owner.deviceId,
        typeId,
        volumeId,
        startedAt: new Date(payload.startedAt),
        completedAt: endedAt,
        status: 'completed',
      })
      .returning({ id: workoutSessions.id });
    if (session === undefined) throw new Error('сессия не создана');

    const exerciseRows = await tx
      .select({ id: exercises.id, name: exercises.canonicalNameRu })
      .from(exercises);
    const exerciseId = new Map(exerciseRows.map((r) => [r.name, r.id]));

    const exerciseValues = payload.workout.entries.map((entry, index) => {
      const group = payload.sets[index] ?? [];
      const done = group.length > 0 && group.every((s) => s.done);
      const isSkipped = payload.skippedExercises?.[index] === true;
      return {
        sessionId: session.id,
        exerciseId: exerciseId.get(entry.exercise.name),
        exerciseNameSnapshot: entry.exercise.name,
        position: index + 1,
        status: (done && !isSkipped ? 'completed' : 'skipped') as 'completed' | 'skipped',
      };
    });
    const exerciseRowsInserted = await tx
      .insert(sessionExercises)
      .values(exerciseValues)
      .returning({ id: sessionExercises.id, position: sessionExercises.position });
    const byPosition = new Map(exerciseRowsInserted.map((r) => [r.position, r.id]));

    const setValues: Array<{
      sessionExerciseId: string;
      setNumber: number;
      weight: string | null;
      reps: number | null;
      completedAt: Date;
    }> = [];
    payload.sets.forEach((group, index) => {
      if (payload.skippedExercises?.[index] === true) return;
      const sessionExerciseId = byPosition.get(index + 1);
      if (sessionExerciseId === undefined) return;
      group.forEach((set, setIndex) => {
        if (!set.done) return;
        setValues.push({
          sessionExerciseId,
          setNumber: setIndex + 1,
          weight: parseWeight(set.weight),
          reps: parseReps(set.reps),
          completedAt: endedAt,
        });
      });
    });
    if (setValues.length > 0) await tx.insert(sessionSets).values(setValues);

    // Длительность — сумма активных интервалов (LOCKED): храним один закрытый
    // интервал на завершённую сессию, чтобы история считала время без пауз.
    const durationMs = Math.max(0, payload.durationMs ?? endedAt.getTime() - new Date(payload.startedAt).getTime());
    if (durationMs > 0) {
      await tx.insert(sessionIntervals).values({
        sessionId: session.id,
        startedAt: new Date(endedAt.getTime() - durationMs),
        endedAt,
      });
    }
    return session.id;
  });
}

/** Завершённые сессии от новых к старым (вкладка «История», S13). */
export async function sessionsForHistory(db: GymixDb): Promise<HistoryItem[]> {
  const rows = await db.db
    .select({
      id: workoutSessions.id,
      type: workoutTypes.key,
      volume: workoutVolumes.key,
      startedAt: workoutSessions.startedAt,
      completedAt: workoutSessions.completedAt,
      done: sql<number>`count(*) FILTER (WHERE ${sessionExercises.status} = 'completed')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(workoutSessions)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
    .innerJoin(sessionExercises, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(eq(workoutSessions.status, 'completed'))
    .groupBy(
      workoutSessions.id,
      workoutSessions.startedAt,
      workoutSessions.completedAt,
      workoutTypes.key,
      workoutVolumes.key,
    )
    .orderBy(desc(workoutSessions.completedAt));

  // Длительность = сумма активных интервалов; для старых записей без
  // интервалов — разница completed_at − started_at.
  const intervalRows = await db.db
    .select({
      sessionId: sessionIntervals.sessionId,
      startedAt: sessionIntervals.startedAt,
      endedAt: sessionIntervals.endedAt,
    })
    .from(sessionIntervals);
  const activeMs = new Map<string, number>();
  for (const row of intervalRows) {
    const end = row.endedAt?.getTime() ?? Date.now();
    activeMs.set(row.sessionId, (activeMs.get(row.sessionId) ?? 0) + Math.max(0, end - row.startedAt.getTime()));
  }

  return rows.map((row) => {
    const startedAt = row.startedAt;
    const completedAt = row.completedAt ?? startedAt;
    const measured = activeMs.get(row.id);
    return {
      id: row.id,
      type: row.type,
      volume: row.volume,
      startedAt,
      completedAt,
      durationMs: measured ?? Math.max(0, completedAt.getTime() - startedAt.getTime()),
      done: row.done,
      total: row.total,
    };
  });
}

/** Самая свежая завершённая тренировка для карточки на главном экране. */
export async function latestSession(db: GymixDb): Promise<HistoryItem | null> {
  const items = await sessionsForHistory(db);
  return items[0] ?? null;
}

/** Последние завершённые тренировки для блока «Последние тренировки» (S01). */
export async function recentSessions(db: GymixDb, limit = 3): Promise<HistoryItem[]> {
  const items = await sessionsForHistory(db);
  return items.slice(0, Math.max(0, limit));
}

/* ------------------------------------------------------------------ *
 * Черновик активной тренировки (S11)
 * ------------------------------------------------------------------ */

export interface DraftSummary {
  readonly sessionId: string;
  readonly readOnly: boolean;
  readonly type: string;
  readonly volume: string;
  readonly startedAt: Date;
  /** Полностью закрытые подходы (completedAt выставлен). */
  readonly doneSets: number;
  /** Запланированные подходы по текущему снимку. */
  readonly totalSets: number;
}

export interface DraftSession {
  readonly sessionId: string;
  /** session_exercise_id по позиции упражнения (начиная с 1). */
  readonly byPosition: ReadonlyMap<number, string>;
}

export interface ResumedSession extends DraftSession {
  readonly workout: GeneratedWorkout;
  readonly sets: readonly (readonly SetEntry[])[];
  /** Упражнения, явно пропущенные пользователем (S10). */
  readonly skipped: readonly boolean[];
  readonly startedAt: number;
  /** Сумма закрытых активных интервалов (мс) — длительность без пауз. */
  readonly elapsedMs: number;
  /** Идёт ли таймер сейчас (открытый интервал есть). */
  readonly running: boolean;
  /** Момент открытия текущего интервала, если таймер идёт. */
  readonly openSince?: number;
}

/** Создать черновик: один активный на пользователя, старый вытесняется. */
/** Гарантия единственного активного черновика при повторном вызове (StrictMode). */

const draftRequests = new WeakMap<GymixDb, WeakMap<GeneratedWorkout, Promise<DraftSession>>>();
export function createDraft(db: GymixDb, workout: GeneratedWorkout): Promise<DraftSession> {
  let requests = draftRequests.get(db);
  if (!requests) { requests = new WeakMap(); draftRequests.set(db, requests); }
  let pending = requests.get(workout);
  if (!pending) {
    const remote = runSessionCommand(db, { kind: 'create', workout });
    pending = remote ? remote.then(value => {
      if (!value) throw new Error('Не удалось создать тренировку');
      return value;
    }) : localChange(db, result => `workout:${result.sessionId}`, scoped => doCreateDraft(scoped, workout));
    requests.set(workout, pending);
    void pending.then(() => requests!.delete(workout), () => requests!.delete(workout));
  }
  return pending;
}

async function doCreateDraft(db: GymixDb, workout: GeneratedWorkout): Promise<DraftSession> {
  const owner = await ensureLocalOwner(db);
  const ids = await resolveTypeVolume(db, workout.type, workout.volume);

  const active = await activeDraft(db);
  if (active) throw new Error('Сначала завершите или удалите текущую тренировку');

  const [session] = await db.db
    .insert(workoutSessions)
    .values({
      userId: owner.userId,
      owningDeviceId: owner.deviceId,
      typeId: ids.typeId,
      volumeId: ids.volumeId,
      startedAt: new Date(),
      status: 'active',
    })
    .returning({ id: workoutSessions.id });
  if (session === undefined) throw new Error('черновик не создан');

  const exerciseRows = await db.db
    .select({ id: exercises.id, name: exercises.canonicalNameRu })
    .from(exercises);
  const exerciseId = new Map(exerciseRows.map((r) => [r.name, r.id]));

  const inserted = await db.db
    .insert(sessionExercises)
    .values(
      workout.entries.map((entry, index) => ({
        sessionId: session.id,
        exerciseId: exerciseId.get(entry.exercise.name) ?? null,
        exerciseNameSnapshot: entry.exercise.name,
        position: index + 1,
        status: 'pending' as const,
      })),
    )
    .returning({ id: sessionExercises.id, position: sessionExercises.position });

  // Старт сессии открывает первый активный интервал таймера (S10, LOCKED).
  await db.db.insert(sessionIntervals).values({ sessionId: session.id, startedAt: new Date() });

  return { sessionId: session.id, byPosition: new Map(inserted.map((r) => [r.position, r.id])) };
}

/** Записать текущее состояние подходов в черновик (upsert по номеру подхода). */
async function _persistDraft(
  db: GymixDb,
  sessionId: string,
  byPosition: ReadonlyMap<number, string>,
  sets: readonly (readonly SetEntry[])[],
  skipped: readonly boolean[] = [],
): Promise<void> {
  sets.forEach((group, index) => {
    if (!skipped[index] && group.some(set => set.done && !validSetInput(set))) throw new Error('Проверь вес и повторения отмеченных подходов.');
  });
  const entries = sets.flatMap((group, index) => {
    const id = byPosition.get(index + 1);
    if (!id) return [];
    const isSkipped = skipped[index] === true;
    const done = group.length > 0 && group.every(set => set.done);
    return [{
      id, status: isSkipped ? 'skipped' : done ? 'completed' : 'pending',
      values: group.map((set, setIndex) => ({
        sessionExerciseId: id, setNumber: setIndex + 1,
        weight: parseWeight(set.weight), reps: parseReps(set.reps), completedAt: set.done && !isSkipped ? new Date() : null
      }))
    }];
  });
  const values = entries.flatMap(entry => entry.values);
  if (entries.length) await db.db.delete(sessionSets).where(or(...entries.map(entry => and(
    eq(sessionSets.sessionExerciseId, entry.id), gt(sessionSets.setNumber, entry.values.length),
  ))));
  if (values.length) await db.db.insert(sessionSets).values(values).onConflictDoUpdate({
    target: [sessionSets.sessionExerciseId, sessionSets.setNumber],
    set: { weight: sql`excluded.weight`, reps: sql`excluded.reps`, completedAt: sql`excluded.completed_at` },
  });
  if (entries.length) await db.db.update(sessionExercises).set({
    status: sql`CASE ${sql.join(entries.map(entry => sql`WHEN ${sessionExercises.id}=${entry.id}::uuid THEN ${entry.status}`), sql` `)} ELSE ${sessionExercises.status} END`,
  }).where(inArray(sessionExercises.id, entries.map(entry => entry.id)));
}

/**
 * Открыть/закрыть активный интервал таймера (S10, LOCKED). Пауза закрывает
 * интервал, продолжение открывает новый — паузы в длительность не попадают.
 * Одновременно открыт не более одного интервала (частичный unique-индекс).
 */
async function _setDraftRunning(
  db: GymixDb,
  sessionId: string,
  running: boolean,
  at: number,
): Promise<void> {
  const open = await db.db
    .select({ id: sessionIntervals.id })
    .from(sessionIntervals)
    .where(and(eq(sessionIntervals.sessionId, sessionId), isNull(sessionIntervals.endedAt)))
    .limit(1);
  if (running) {
    if (open[0] === undefined) {
      await db.db.insert(sessionIntervals).values({ sessionId, startedAt: new Date(at) });
    }
  } else if (open[0] !== undefined) {
    await db.db
      .update(sessionIntervals)
      .set({ endedAt: new Date(at) })
      .where(eq(sessionIntervals.id, open[0].id));
  }
}

/** Активный черновик для баннера восстановления. Один на пользователя. */
export async function activeDraft(db: GymixDb): Promise<DraftSummary | null> {
  const owner = await ensureLocalOwner(db);
  const rows = await db.db
    .select({
      id: workoutSessions.id,
      owningDeviceId: workoutSessions.owningDeviceId,
      type: workoutTypes.key,
      volume: workoutVolumes.key,
      startedAt: workoutSessions.startedAt,
    })
    .from(workoutSessions)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
    .where(and(eq(workoutSessions.userId, owner.userId), eq(workoutSessions.status, 'active')))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;

  const counts = await db.db
    .select({
      done: sql<number>`count(*) FILTER (WHERE ${sessionSets.completedAt} IS NOT NULL)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .where(eq(sessionExercises.sessionId, row.id));

  return {
    sessionId: row.id,
    readOnly: await workoutReadOnly(db, `workout:${row.id}`),
    type: row.type,
    volume: row.volume,
    startedAt: row.startedAt,
    doneSets: counts[0]?.done ?? 0,
    totalSets: counts[0]?.total ?? 0,
  };
}

/** Полный снимок черновика для восстановления на экране выполнения (S11 → S10). */
export async function resumeDraft(db: GymixDb, sessionId: string): Promise<ResumedSession> {
  const rows = await db.db
    .select({
      id: workoutSessions.id,
      type: workoutTypes.key,
      volume: workoutVolumes.key,
      startedAt: workoutSessions.startedAt,
    })
    .from(workoutSessions)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error('черновик не найден');

  const exRows = await db.db
    .select({
      id: sessionExercises.id,
      position: sessionExercises.position,
      name: sessionExercises.exerciseNameSnapshot,
      status: sessionExercises.status,
    })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position));
  const byPosition = new Map(exRows.map((r) => [r.position, r.id]));

  const setRows = await db.db
    .select({
      sessionExerciseId: sessionSets.sessionExerciseId,
      setNumber: sessionSets.setNumber,
      weight: sessionSets.weight,
      reps: sessionSets.reps,
      completedAt: sessionSets.completedAt,
    })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionSets.setNumber));

  const byExercise = new Map<string, (typeof setRows)[number][]>();
  for (const set of setRows) {
    const current = byExercise.get(set.sessionExerciseId) ?? [];
    current.push(set);
    byExercise.set(set.sessionExerciseId, current);
  }

  const sets = exRows.map((exRow) => {
    const own = byExercise.get(exRow.id) ?? [];
    return own.length > 0
      ? own.map((set) => ({
        weight: set.weight != null ? String(Number(set.weight)) : '',
        reps: set.reps?.toString() ?? '',
        done: set.completedAt !== null,
      }))
      : Array.from({ length: 3 }, () => ({ weight: '', reps: '', done: false }));
  });

  const workout = buildWorkoutFromEntries(
    row.type as GeneratedWorkout['type'],
    row.volume as GeneratedWorkout['volume'],
    exRows.map((exRow) => ({ slotKey: `s${exRow.position}`, exerciseName: exRow.name })),
  );

  const intervalRows = await db.db
    .select({ startedAt: sessionIntervals.startedAt, endedAt: sessionIntervals.endedAt })
    .from(sessionIntervals)
    .where(eq(sessionIntervals.sessionId, sessionId))
    .orderBy(asc(sessionIntervals.startedAt));
  let elapsedMs = 0;
  let openSince: number | undefined;
  for (const interval of intervalRows) {
    if (interval.endedAt !== null) {
      elapsedMs += Math.max(0, interval.endedAt.getTime() - interval.startedAt.getTime());
    } else {
      openSince = interval.startedAt.getTime();
    }
  }

  return {
    sessionId,
    byPosition,
    workout,
    sets,
    skipped: exRows.map((exRow) => exRow.status === 'skipped'),
    startedAt: row.startedAt.getTime(),
    elapsedMs,
    running: openSince !== undefined,
    ...(openSince !== undefined ? { openSince } : {}),
  };
}

/** Удалить черновик (каскадно: упражнения и подходы). */
async function _deleteDraft(db: GymixDb, sessionId: string): Promise<void> {
  await db.db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
}

async function resolveTypeVolume(
  db: GymixDb,
  type: string,
  volume: string,
): Promise<{ typeId: string; volumeId: string; }> {
  const typeId = (
    await db.db.select({ id: workoutTypes.id }).from(workoutTypes).where(eq(workoutTypes.key, type)).limit(1)
  )[0]?.id;
  const volumeId = (
    await db.db.select({ id: workoutVolumes.id }).from(workoutVolumes).where(eq(workoutVolumes.key, volume)).limit(1)
  )[0]?.id;
  if (typeId === undefined || volumeId === undefined) {
    throw new Error(`нет справочника тип/объём для ${type} · ${volume}`);
  }
  return { typeId, volumeId };
}

export async function ensureLocalOwner(db: GymixDb): Promise<{ userId: string; deviceId: string; }> {
  return { userId: db.account.userId, deviceId: db.account.deviceId };
}

/** Запятые из ввода приводим к десятичной точке, мусор отбрасываем. */
function parseWeight(value: string | undefined): string | null {
  return value === undefined ? null : weightValue(value);
}

function parseReps(value: string | undefined): number | null {
  return value === undefined ? null : repsValue(value);
}
export const saveSession = (db: GymixDb, payload: SessionSnapshot) => localChange(db, id => `workout:${id}`, scoped => _saveSession(scoped, payload));
export const persistDraft = async (db: GymixDb, id: string, byPosition: ReadonlyMap<number, string>, sets: readonly (readonly SetEntry[])[], skipped: readonly boolean[] = []): Promise<void> => {
  await (runSessionCommand(db, { kind: 'persist', draft: { sessionId: id, byPosition }, sets, skipped }) ?? localChange(db, `workout:${id}`, scoped => _persistDraft(scoped, id, byPosition, sets, skipped)));
};
export const setDraftRunning = async (db: GymixDb, id: string, running: boolean, at = Date.now()): Promise<void> => {
  await (runSessionCommand(db, { kind: 'running', sessionId: id, running, at }) ?? localChange(db, `workout:${id}`, scoped => _setDraftRunning(scoped, id, running, at)));
};
export const deleteDraft = async (db: GymixDb, id: string): Promise<void> => {
  await (runSessionCommand(db, { kind: 'delete', sessionId: id }) ?? localChange(db, `workout:${id}`, scoped => _deleteDraft(scoped, id)));
};
export async function finishDraft(db: GymixDb, draft: DraftSession, payload: SessionSnapshot): Promise<void> {
  const remote = runSessionCommand(db, { kind: 'finish', draft, payload });
  if (remote) { await remote; return; }
  await localChange(db, `workout:${draft.sessionId}`, async scoped => {
    await _persistDraft(scoped, draft.sessionId, draft.byPosition, payload.sets, payload.skippedExercises);
    await scoped.db.update(sessionIntervals).set({ endedAt: new Date(payload.endedAt) })
      .where(and(eq(sessionIntervals.sessionId, draft.sessionId), isNull(sessionIntervals.endedAt)));
    await scoped.db.update(workoutSessions).set({ status: 'completed', completedAt: new Date(payload.endedAt), updatedAt: new Date(), revision: sql`${workoutSessions.revision} + 1` })
      .where(eq(workoutSessions.id, draft.sessionId));
  });
}
