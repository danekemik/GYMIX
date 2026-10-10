import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@gymix/db/seed-data';
import {
  exercises,
  sessionExercises,
  sessionIntervals,
  sessionSets,
  workoutSessions,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';

/**
 * Снимок тренировки: сессия + упражнения + подходы + интервалы таймера.
 * Поедает и рест-эндпоинт, и ответ на пачку операций, чтобы клиент не
 * гонял лишние запросы. `readOnly` = true, когда сессию ведёт другое
 * устройство, и с этого устройства можно только читать и передать
 * владение.
 */

export interface SessionSnapshot {
  id: string;
  revision: number;
  status: 'active' | 'completed';
  type: string;
  volume: string;
  sourceTemplateId: string | null;
  startedAt: string;
  completedAt: string | null;
  owningDeviceId: string;
  readOnly: boolean;
  countedExercises: number;
  durationMs: number;
  exercises: Array<{
    id: string;
    exerciseId: string | null;
    name: string;
    status: 'pending' | 'active' | 'completed' | 'skipped';
    position: number;
    imageUrl: string | null;
    sets: Array<{
      id: string;
      setNumber: number;
      weight: string | null;
      reps: number | null;
      completedAt: string | null;
    }>;
  }>;
  intervals: Array<{ startedAt: string; endedAt: string | null }>;
}

export async function getSessionSnapshot(
  db: Db,
  sessionId: string,
  requestDeviceId: string,
  clock: () => Date,
): Promise<SessionSnapshot> {
  const [row] = await db
    .select({
      session: workoutSessions,
      typeKey: workoutTypes.key,
      volumeKey: workoutVolumes.key,
    })
    .from(workoutSessions)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
    .where(eq(workoutSessions.id, sessionId));

  if (!row) throw new Error('Сессия не найдена');

  const exerciseRows = await db
    .select({
      ex: sessionExercises,
      imageUrl: exercises.imageUrl,
    })
    .from(sessionExercises)
    .leftJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(sessionExercises.position);

  const ids = exerciseRows.map((r) => r.ex.id);
  const sets = ids.length
    ? await db
        .select()
        .from(sessionSets)
        .where(inArray(sessionSets.sessionExerciseId, ids))
        .orderBy(sessionSets.sessionExerciseId, sessionSets.setNumber)
    : [];
  const setsByExercise = groupBy(sets, (s) => s.sessionExerciseId);

  const intervals = await db
    .select()
    .from(sessionIntervals)
    .where(eq(sessionIntervals.sessionId, sessionId))
    .orderBy(sessionIntervals.startedAt);

  const now = clock().getTime();
  let durationMs = 0;
  for (const interval of intervals) {
    durationMs +=
      (interval.endedAt ? interval.endedAt.getTime() : now) -
      interval.startedAt.getTime();
  }

  const session = row.session;
  const counted = exerciseRows.filter((r) => r.ex.status === 'completed').length;

  return {
    id: session.id,
    revision: session.revision,
    status: session.status,
    type: row.typeKey,
    volume: row.volumeKey,
    sourceTemplateId: session.sourceTemplateId,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    owningDeviceId: session.owningDeviceId,
    readOnly: session.owningDeviceId !== requestDeviceId,
    countedExercises: counted,
    durationMs,
    exercises: exerciseRows.map((r) => ({
      id: r.ex.id,
      exerciseId: r.ex.exerciseId,
      name: r.ex.exerciseNameSnapshot,
      status: r.ex.status,
      position: r.ex.position,
      imageUrl: r.imageUrl,
      sets: (setsByExercise.get(r.ex.id) ?? []).map((s) => ({
        id: s.id,
        setNumber: s.setNumber,
        weight: s.weight === null ? null : String(s.weight),
        reps: s.reps,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      })),
    })),
    intervals: intervals.map((i) => ({
      startedAt: i.startedAt.toISOString(),
      endedAt: i.endedAt ? i.endedAt.toISOString() : null,
    })),
  };
}

function groupBy<T, K extends string>(
  rows: readonly T[],
  key: (row: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}