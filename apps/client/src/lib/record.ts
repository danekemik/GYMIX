import { eq, sql } from 'drizzle-orm';
import {
  sessionExercises,
  sessionSets,
  workoutSessions,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import type { GymixDb } from './db';

export interface RecordSet {
  readonly id: string;
  readonly setNumber: number;
  readonly weight: string | null;
  readonly reps: number | null;
}

export interface RecordExercise {
  readonly id: string;
  readonly name: string;
  readonly status: 'completed' | 'skipped';
  readonly sets: readonly RecordSet[];
}

export interface RecordSnapshot {
  readonly id: string;
  readonly type: string;
  readonly volume: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly exercises: readonly RecordExercise[];
}

function formatWeight(value: string | null): string | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}

/** Снимок завершённой сессии по идентификатору (S14). */
export async function loadRecord(db: GymixDb, sessionId: string): Promise<RecordSnapshot> {
  const session = await db.db
    .select({
      id: workoutSessions.id,
      type: workoutTypes.key,
      volume: workoutVolumes.key,
      startedAt: workoutSessions.startedAt,
      completedAt: workoutSessions.completedAt,
    })
    .from(workoutSessions)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);

  const row = session[0];
  if (row === undefined) throw new Error(`сессия ${sessionId} не найдена`);
  if (row.completedAt === null) throw new Error(`сессия ${sessionId} не завершена`);

  const exercises = await db.db
    .select({
      id: sessionExercises.id,
      name: sessionExercises.exerciseNameSnapshot,
      status: sessionExercises.status,
      position: sessionExercises.position,
    })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(sessionExercises.position);

  const exerciseIds = exercises.map((e) => e.id);
  const setRows = (
    await Promise.all(
      exerciseIds.map((id) =>
        db.db
          .select({
            id: sessionSets.id,
            sessionExerciseId: sessionSets.sessionExerciseId,
            setNumber: sessionSets.setNumber,
            weight: sessionSets.weight,
            reps: sessionSets.reps,
          })
          .from(sessionSets)
          .where(eq(sessionSets.sessionExerciseId, id)),
      ),
    )
  ).flat();

  return {
    id: row.id,
    type: row.type,
    volume: row.volume,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    exercises: exercises.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status === 'completed' ? 'completed' : 'skipped',
      sets: setRows
        .filter((s) => s.sessionExerciseId === e.id)
        .map((s) => ({ id: s.id, setNumber: s.setNumber, weight: formatWeight(s.weight), reps: s.reps }))
        .sort((a, b) => a.setNumber - b.setNumber),
    })),
  };
}

export interface RecordPatchExercise {
  readonly id: string;
  readonly status: 'completed' | 'skipped';
  readonly sets: readonly { id: string; weight: string | null; reps: number | null }[];
}

export interface RecordPatch {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly exercises: readonly RecordPatchExercise[];
}

function parseWeight(value: string | null): string | null {
  if (value === null || value === '') return null;
  const clean = value.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(clean) ? clean : null;
}

function parseReps(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return Math.max(0, Math.floor(value));
}

/**
 * Сохранить исправления записи (S14): вес/повторы подходов, статусы
 * упражнений, порядок, дату. Порядок переписывается заново по массиву —
 * двухфазно, чтобы не нарушить уникальный (session, position).
 */
export async function saveRecord(db: GymixDb, sessionId: string, patch: RecordPatch): Promise<void> {
  await db.db.transaction(async (tx) => {
    await tx
      .update(workoutSessions)
      .set({
        startedAt: patch.startedAt,
        completedAt: patch.completedAt,
        revision: sql`${workoutSessions.revision} + 1`,
      })
      .where(eq(workoutSessions.id, sessionId));

    for (const ex of patch.exercises) {
      await tx.update(sessionExercises).set({ status: ex.status }).where(eq(sessionExercises.id, ex.id));
      for (const set of ex.sets) {
        await tx
          .update(sessionSets)
          .set({ weight: parseWeight(set.weight), reps: parseReps(set.reps) })
          .where(eq(sessionSets.id, set.id));
      }
    }

    const ids = patch.exercises.map((e) => e.id);
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(sessionExercises)
        .set({ position: -(i + 1) })
        .where(eq(sessionExercises.id, ids[i]!));
    }
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(sessionExercises)
        .set({ position: i + 1 })
        .where(eq(sessionExercises.id, ids[i]!));
    }
  });
}