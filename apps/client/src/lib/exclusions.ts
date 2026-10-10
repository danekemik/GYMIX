import { and, asc, eq } from 'drizzle-orm';
import { exercises, userExcludedExercises } from '@gymix/db/schema';
import type { MuscleGroup } from '@gymix/structures';
import { getCatalog } from './catalog';
import type { GymixDb } from './db';
import { ensureLocalOwner } from './session';

export interface ExcludedExercise {
  readonly exerciseId: string;
  readonly name: string;
  /** Первичная группа из каталога (тот же источник, что и сид БД). */
  readonly primary: MuscleGroup;
}

/** Группа по имени из каталога — каталог и БД заводятся из одного md. */
function primaryFor(name: string): MuscleGroup {
  return getCatalog().exercises.find((e) => e.name === name)?.primary ?? 'Грудь';
}

/** Исключённые упражнения от новых к старым — вкладка «Не предлагать» (S15). */
export async function listExcluded(db: GymixDb): Promise<ExcludedExercise[]> {
  const rows = await db.db
    .select({
      exerciseId: userExcludedExercises.exerciseId,
      name: exercises.canonicalNameRu,
    })
    .from(userExcludedExercises)
    .innerJoin(
      exercises,
      eq(userExcludedExercises.exerciseId, exercises.id),
    )
    .orderBy(asc(exercises.canonicalNameRu));
  return rows.map((r) => ({ exerciseId: r.exerciseId, name: r.name, primary: primaryFor(r.name) }));
}

/**
 * Сколько упражнений исключено. Нужен, чтобы показать чистое состояние
 * после «Вернуть все» без лишнего реквеста всего списка.
 */
export async function excludedCount(db: GymixDb): Promise<number> {
  const owner = await ensureLocalOwner(db);
  const rows = await db.db
    .select({ id: userExcludedExercises.exerciseId })
    .from(userExcludedExercises)
    .where(eq(userExcludedExercises.userId, owner.userId));
  return rows.length;
}

/** Имена исключённых для генератора и каталога. БД и каталог разделяют имена. */
export async function excludedExerciseNames(db: GymixDb): Promise<string[]> {
  const rows = await listExcluded(db);
  return rows.map((r) => r.name);
}

/** Пометить «Не предлагать это упражнение» (S09/S15). */
export async function excludeExerciseByName(db: GymixDb, name: string): Promise<void> {
  const owner = await ensureLocalOwner(db);
  const found = await db.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.canonicalNameRu, name))
    .limit(1);
  const exerciseId = found[0]?.id;
  if (exerciseId === undefined) return;
  await db.db
    .insert(userExcludedExercises)
    .values({ userId: owner.userId, exerciseId })
    .onConflictDoNothing();
}

/** Вернуть упражнение в подбор (S15). */
export async function includeExerciseByName(db: GymixDb, name: string): Promise<void> {
  const owner = await ensureLocalOwner(db);
  const found = await db.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.canonicalNameRu, name))
    .limit(1);
  const exerciseId = found[0]?.id;
  if (exerciseId === undefined) return;
  await db.db
    .delete(userExcludedExercises)
    .where(and(eq(userExcludedExercises.userId, owner.userId), eq(userExcludedExercises.exerciseId, exerciseId)));
}

/** Вернуть все исключённые упражнения (S15). */
export async function includeAllExcluded(db: GymixDb): Promise<void> {
  const owner = await ensureLocalOwner(db);
  await db.db.delete(userExcludedExercises).where(eq(userExcludedExercises.userId, owner.userId));
}