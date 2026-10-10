import { asc, eq } from 'drizzle-orm';
import { bodyWeightEntries, exercises, sessionExercises, sessionSets, workoutSessions } from '@gymix/db/schema';
import type { GymixDb } from './db';
import { ensureLocalOwner } from './session';

/**
 * Точка графика: лучший подход одной тренировки.
 * LOCKED (2026-10-05): макс. вес, при равенстве — макс. повторения.
 */
export interface ExercisePoint {
  readonly date: Date;
  readonly weight: number;
  readonly reps: number;
}

/** Одна линия прогресса — одно упражнение. Пропущенные сессии точек не дают. */
export interface ExerciseSeries {
  readonly name: string;
  readonly points: readonly ExercisePoint[];
}

/** Лучший подход сессии: макс. вес, при равенстве — макс. повторения. */
function bestSet(sets: ReadonlyArray<{ weight: number; reps: number; date: Date }>): ExercisePoint {
  let best = sets[0]!;
  for (const s of sets) {
    if (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = s;
  }
  return { date: best.date, weight: best.weight, reps: best.reps };
}

/**
 * Динамика по упражнению: завершённые сессии → одна точка (лучший подход).
 * Группировка по снимку названия — прошлые тренировки не ломаются, даже
 * если каталог позже переименовал упражнение.
 */
export async function progressSeries(db: GymixDb, since?: Date): Promise<ExerciseSeries[]> {
  const rows = await db.db
    .select({
      name: exercises.canonicalNameRu,
      snapshot: sessionExercises.exerciseNameSnapshot,
      date: workoutSessions.startedAt,
      weight: sessionSets.weight,
      reps: sessionSets.reps,
    })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionSets.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .leftJoin(exercises, eq(sessionExercises.exerciseId, exercises.id))
    .where(eq(workoutSessions.status, 'completed'))
    .orderBy(asc(workoutSessions.startedAt));

  const byName = new Map<string, Map<string, { weight: number; reps: number; date: Date }[]>>();
  for (const row of rows) {
    if (row.weight === null || row.reps === null) continue;
    const name = row.name ?? row.snapshot;
    const sessionKey = `${row.date.getTime()}`;
    const bySession = byName.get(name) ?? new Map<string, { weight: number; reps: number; date: Date }[]>();
    const sets = bySession.get(sessionKey) ?? [];
    sets.push({ weight: Number(row.weight), reps: row.reps, date: row.date });
    bySession.set(sessionKey, sets);
    byName.set(name, bySession);
  }

  const series: ExerciseSeries[] = [];
  for (const [name, sessions] of byName) {
    const points = [...sessions.entries()]
      .map(([_key, sets]) => bestSet(sets))
      .filter((p) => since === undefined || p.date >= since)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (points.length > 0) series.push({ name, points });
  }
  series.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return series;
}

export interface BodyWeightPoint {
  readonly date: string;
  readonly value: number;
}

/** Вес тела по дням: одна запись на день, уникальный ключ (user, date). */
export async function bodyWeightSeries(db: GymixDb, since?: Date): Promise<BodyWeightPoint[]> {
  const owner = await ensureLocalOwner(db);
  const rows = await db.db
    .select({ date: bodyWeightEntries.measuredAt, value: bodyWeightEntries.value })
    .from(bodyWeightEntries)
    .where(eq(bodyWeightEntries.userId, owner.userId))
    .orderBy(asc(bodyWeightEntries.measuredAt));
  const sinceKey = since === undefined ? undefined : since.toISOString().slice(0, 10);
  return rows
    .filter((r) => sinceKey === undefined || r.date >= sinceKey)
    .map((r) => ({ date: r.date, value: Number(r.value) }));
}

/** Записать/обновить вес тела за конкретный день (S13). */
export async function saveBodyWeight(db: GymixDb, date: string, value: number): Promise<void> {
  const owner = await ensureLocalOwner(db);
  await db.db
    .insert(bodyWeightEntries)
    .values({ userId: owner.userId, measuredAt: date, value: String(value) })
    .onConflictDoUpdate({
      target: [bodyWeightEntries.userId, bodyWeightEntries.measuredAt],
      set: { value: String(value) },
    });
}