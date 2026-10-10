import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
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
import type { SessionSnapshot, SetEntry } from '../screens/ExecuteScreen';
import type { GymixDb } from './db';
import { buildWorkoutFromEntries } from './reconstruct';

/**
 * Сессии в PGlite хранятся под локальным владельцем: у приложения пока нет
 * аутентификации, а `workout_sessions` требует пользователя и устройство.
 * Владелец создаётся один раз на первую запись.
 */
const LOCAL_EMAIL = 'local@offline.gymix';
const LOCAL_DEVICE_LABEL = 'Этот телефон';

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

let ownerCache: { userId: string; deviceId: string } | undefined;

/**
 * Снимок завершённой тренировки в историю. Пустая сессия сюда не доходит —
 * LOCKED (2026-10-05) блокирует финиш при 0 выполненных упражнений.
 */
export async function saveSession(db: GymixDb, payload: SessionSnapshot): Promise<void> {
  const owner = await ensureLocalOwner(db);

  const typeId = (
    await db.db
      .select({ id: workoutTypes.id })
      .from(workoutTypes)
      .where(eq(workoutTypes.key, payload.workout.type))
      .limit(1)
  )[0]?.id;
  const volumeId = (
    await db.db
      .select({ id: workoutVolumes.id })
      .from(workoutVolumes)
      .where(eq(workoutVolumes.key, payload.workout.volume))
      .limit(1)
  )[0]?.id;
  if (typeId === undefined || volumeId === undefined) {
    throw new Error(`нет справочника тип/объём для ${payload.workout.type} · ${payload.workout.volume}`);
  }

  const endedAt = new Date(payload.endedAt);
  const [session] = await db.db
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

  const exerciseRows = await db.db
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
  const exerciseRowsInserted = await db.db
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
  if (setValues.length > 0) await db.db.insert(sessionSets).values(setValues);

  // Длительность — сумма активных интервалов (LOCKED): храним один закрытый
  // интервал на завершённую сессию, чтобы история считала время без пауз.
  const durationMs = Math.max(0, payload.durationMs ?? endedAt.getTime() - new Date(payload.startedAt).getTime());
  if (durationMs > 0) {
    await db.db.insert(sessionIntervals).values({
      sessionId: session.id,
      startedAt: new Date(endedAt.getTime() - durationMs),
      endedAt,
    });
  }
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

/* ------------------------------------------------------------------ *
 * Черновик активной тренировки (S11)
 * ------------------------------------------------------------------ */

export interface DraftSummary {
  readonly sessionId: string;
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
let creatingDraft: Promise<unknown> | undefined;

/** Создать черновик сессии. Удаляет предыдущий активный (S11: один на пользователя). */
export function createDraft(db: GymixDb, workout: GeneratedWorkout): Promise<DraftSession> {
  const task = (creatingDraft ?? Promise.resolve()).then(() => doCreateDraft(db, workout));
  creatingDraft = task.catch(() => undefined);
  return task;
}

async function doCreateDraft(db: GymixDb, workout: GeneratedWorkout): Promise<DraftSession> {
  const owner = await ensureLocalOwner(db);
  const ids = await resolveTypeVolume(db, workout.type, workout.volume);

  await db.db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.userId, owner.userId), eq(workoutSessions.status, 'active')));

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
export async function persistDraft(
  db: GymixDb,
  sessionId: string,
  byPosition: ReadonlyMap<number, string>,
  sets: readonly (readonly SetEntry[])[],
  skipped: readonly boolean[] = [],
): Promise<void> {
  await Promise.all(
    sets.map(async (group, index) => {
      const sessionExerciseId = byPosition.get(index + 1);
      if (sessionExerciseId === undefined) return;
      const isSkipped = skipped[index] === true;
      const values = group.map((set, setIndex) => ({
        sessionExerciseId,
        setNumber: setIndex + 1,
        weight: parseWeight(set.weight),
        reps: parseReps(set.reps),
        // Пропущенное упражнение не засчитывается, но ввод сохраняем для возврата.
        completedAt: set.done && !isSkipped ? new Date() : null,
      }));
      if (values.length > 0) {
        await db.db
          .insert(sessionSets)
          .values(values)
          .onConflictDoUpdate({
            target: [sessionSets.sessionExerciseId, sessionSets.setNumber],
            set: {
              weight: sql`excluded.weight`,
              reps: sql`excluded.reps`,
              completedAt: sql`excluded.completed_at`,
            },
          });
      }
      const done = group.length > 0 && group.every((s) => s.done);
      await db.db
        .update(sessionExercises)
        .set({ status: isSkipped ? 'skipped' : done ? 'completed' : 'pending' })
        .where(eq(sessionExercises.id, sessionExerciseId));
    }),
  );
}

/**
 * Открыть/закрыть активный интервал таймера (S10, LOCKED). Пауза закрывает
 * интервал, продолжение открывает новый — паузы в длительность не попадают.
 * Одновременно открыт не более одного интервала (частичный unique-индекс).
 */
export async function setDraftRunning(
  db: GymixDb,
  sessionId: string,
  running: boolean,
): Promise<void> {
  const open = await db.db
    .select({ id: sessionIntervals.id })
    .from(sessionIntervals)
    .where(and(eq(sessionIntervals.sessionId, sessionId), isNull(sessionIntervals.endedAt)))
    .limit(1);
  if (running) {
    if (open[0] === undefined) {
      await db.db.insert(sessionIntervals).values({ sessionId, startedAt: new Date() });
    }
  } else if (open[0] !== undefined) {
    await db.db
      .update(sessionIntervals)
      .set({ endedAt: new Date() })
      .where(eq(sessionIntervals.id, open[0].id));
  }
}

/** Активный черновик для баннера восстановления. Один на пользователя. */
export async function activeDraft(db: GymixDb): Promise<DraftSummary | null> {
  const owner = await ensureLocalOwner(db);
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
export async function deleteDraft(db: GymixDb, sessionId: string): Promise<void> {
  await db.db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
}

async function resolveTypeVolume(
  db: GymixDb,
  type: string,
  volume: string,
): Promise<{ typeId: string; volumeId: string }> {
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

export async function ensureLocalOwner(db: GymixDb): Promise<{ userId: string; deviceId: string }> {
  if (ownerCache !== undefined) return ownerCache;

  const existing = await db.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, LOCAL_EMAIL))
    .limit(1);

  let userId: string;
  if (existing[0] !== undefined) {
    userId = existing[0].id;
  } else {
    const inserted = await db.db
      .insert(users)
      .values({ email: LOCAL_EMAIL, passwordHash: 'local-offline' })
      .returning({ id: users.id });
    if (inserted[0] === undefined) throw new Error('локальный пользователь не создан');
    userId = inserted[0].id;
  }

  const devicesForUser = await db.db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.userId, userId))
    .limit(1);
  let deviceId = devicesForUser[0]?.id;
  if (deviceId === undefined) {
    const inserted = await db.db
      .insert(devices)
      .values({ userId, label: LOCAL_DEVICE_LABEL })
      .returning({ id: devices.id });
    if (inserted[0] === undefined) throw new Error('устройство не создано');
    deviceId = inserted[0].id;
  }

  ownerCache = { userId, deviceId };
  return ownerCache;
}

/** Запятые из ввода приводим к десятичной точке, мусор отбрасываем. */
function parseWeight(value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  const clean = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return clean;
}

function parseReps(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const reps = Number.parseInt(value, 10);
  return Number.isInteger(reps) && reps > 0 ? reps : null;
}