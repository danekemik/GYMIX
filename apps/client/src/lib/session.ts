import { desc, eq, sql } from 'drizzle-orm';
import {
  devices,
  exercises,
  sessionExercises,
  sessionSets,
  users,
  workoutSessions,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import type { SessionSnapshot } from '../screens/ExecuteScreen';
import type { GymixDb } from './db';

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
    return {
      sessionId: session.id,
      exerciseId: exerciseId.get(entry.exercise.name),
      exerciseNameSnapshot: entry.exercise.name,
      position: index + 1,
      status: (done ? 'completed' : 'skipped') as 'completed' | 'skipped',
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

  return rows.map((row) => {
    const startedAt = row.startedAt;
    const completedAt = row.completedAt ?? startedAt;
    return {
      id: row.id,
      type: row.type,
      volume: row.volume,
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
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

async function ensureLocalOwner(db: GymixDb): Promise<{ userId: string; deviceId: string }> {
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