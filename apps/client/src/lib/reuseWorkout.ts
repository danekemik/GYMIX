import { and, eq, sql } from 'drizzle-orm';
import { workoutSessions, workoutTypes, workoutVolumes, sessionExercises } from '@gymix/db/schema';
import type { GeneratedWorkout } from '@gymix/generator';
import type { SetEntry } from '../domain/session';
import type { GymixDb } from './db';
import { buildWorkoutFromEntries } from './reconstruct';

/** Reuse the saved composition without changing the completed session. */
export async function workoutFromHistory(db: GymixDb, sessionId: string): Promise<GeneratedWorkout> {
  const entries = await db.db.select({ type: workoutTypes.key, volume: workoutVolumes.key, name: sessionExercises.exerciseNameSnapshot })
    .from(workoutSessions)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
    .innerJoin(sessionExercises, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, db.account.userId), eq(workoutSessions.status, 'completed')))
    .orderBy(sessionExercises.position);
  if (!entries[0]) throw new Error('Завершённая тренировка не найдена');
  return buildWorkoutFromEntries(entries[0].type as GeneratedWorkout['type'], entries[0].volume as GeneratedWorkout['volume'],
    entries.map((exercise, index) => ({ slotKey: `s${index + 1}`, exerciseName: exercise.name })));
}

/** Latest completed occurrence of each exercise, never a mixture of sessions.
 * Suggested values are editable and are never marked completed automatically. */
export async function previousWorkingSets(db: GymixDb, names: readonly string[]): Promise<Map<string, SetEntry[]>> {
  if (!names.length) return new Map();
  const result = await db.db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (e.exercise_name_snapshot) e.id, e.exercise_name_snapshot AS name
      FROM session_exercises e JOIN workout_sessions w ON w.id=e.session_id
      WHERE w.user_id=${db.account.userId} AND w.status='completed' AND e.status='completed'
        AND e.exercise_name_snapshot IN (${sql.join(names.map(name => sql`${name}`), sql`, `)})
      ORDER BY e.exercise_name_snapshot, w.completed_at DESC, w.id DESC
    )
    SELECT latest.name, s.set_number AS "setNumber", s.weight, s.reps
    FROM latest JOIN session_sets s ON s.session_exercise_id=latest.id
    WHERE s.completed_at IS NOT NULL ORDER BY latest.name, s.set_number
  `);
  const entries = (result as unknown as { rows: Array<{ name: string; setNumber: number; weight: string | null; reps: number | null; }>; }).rows;
  const groups = new Map<string, SetEntry[]>();
  for (const row of entries) {
    const sets = groups.get(row.name) ?? [];
    // Keep numbered gaps empty instead of shifting later sets into earlier ones.
    while (sets.length < row.setNumber) sets.push({ weight: '', reps: '', done: false });
    sets[row.setNumber - 1] = { weight: row.weight === null ? '' : String(Number(row.weight)), reps: row.reps?.toString() ?? '', done: false };
    groups.set(row.name, sets);
  }
  return groups;
}
