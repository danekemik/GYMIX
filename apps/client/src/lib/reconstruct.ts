import type { CatalogExercise } from '@gymix/catalog/parse';
import type { GeneratedWorkout } from '@gymix/generator';
import {
  GENERATOR_MUSCLE_GROUPS,
  findStructure,
  type GeneratorMuscleGroup,
  type VolumeLevel,
  type WorkoutType,
  type Slot,
} from '@gymix/structures';
import { getCatalog } from './catalog';

/**
 * Реконструкция `GeneratedWorkout` по сохранённым строкам: шаблоны хранят
 * slotKey, сессии — только позицию. Группа слота для отображения выводится
 * из структуры там, где её можно восстановить, иначе — из каталога.
 */

export interface StoredEntry {
  readonly slotKey: string;
  readonly exerciseName: string;
}

export function buildWorkoutFromEntries(
  type: WorkoutType,
  volume: VolumeLevel,
  rows: readonly StoredEntry[],
): GeneratedWorkout {
  const slotByKey =
    type === 'Muscle Group Split'
      ? null
      : new Map(findStructure({ type, volume }).slots.map((slot) => [slot.slotKey, slot]));
  const byName = new Map(getCatalog().exercises.map((e) => [e.name, e]));

  const entries = rows.map((row) => {
    const exercise = byName.get(row.exerciseName) ?? fallbackExercise(row.exerciseName);
    const slot = slotByKey?.get(row.slotKey) ?? undefined;
    return {
      slotKey: slot?.slotKey ?? row.slotKey,
      exercise,
      groupUsed: slot !== undefined ? groupUsedFor(exercise, slot) : defaultGroup(exercise),
      isRepeat: false,
    };
  });

  return { type, volume, entries };
}

/** Первая группа слота, в которую входит упражнение (как в генераторе). */
function groupUsedFor(exercise: CatalogExercise, slot: Slot): GeneratorMuscleGroup {
  const primary = slot.allowedGroupIds.find((g) => exercise.muscles.includes(g));
  if (primary !== undefined) return primary;
  const alternative = slot.alternativeGroupIds.find((g) => exercise.muscles.includes(g));
  if (alternative !== undefined) return alternative;
  return slot.allowedGroupIds[0] ?? defaultGroup(exercise);
}

/** Группа для отображения, когда структура недоступна (MGS, изменившийся каталог). */
export function defaultGroup(exercise: CatalogExercise): GeneratorMuscleGroup {
  const candidate = exercise.muscles[0] ?? exercise.primary;
  return (GENERATOR_MUSCLE_GROUPS as readonly string[]).includes(candidate as string)
    ? (candidate as GeneratorMuscleGroup)
    : 'Квадрицепс';
}

/** Запись, которой нет в текущем каталоге (исключена или удалена из справочника). */
export function fallbackExercise(name: string): CatalogExercise {
  return {
    name,
    muscles: [],
    secondaryMuscles: [],
    tags: [],
    equipment: [],
    patterns: [],
    sections: [],
    primary: 'Пресс',
    catalogOnly: true,
  };
}