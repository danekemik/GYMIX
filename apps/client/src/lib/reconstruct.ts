import type { CatalogExercise } from '@gymix/catalog/parse';
import { matchesSlot } from '@gymix/catalog/parse';
import type { GeneratedWorkout } from '@gymix/generator';
import {
  GENERATOR_MUSCLE_GROUPS,
  findStructure,
  mgsSlots,
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
  readonly groupUsed?: GeneratorMuscleGroup;
}

export function buildWorkoutFromEntries(
  type: WorkoutType,
  volume: VolumeLevel,
  rows: readonly StoredEntry[],
): GeneratedWorkout {
  const byName = new Map(getCatalog().exercises.map((e) => [e.name, e]));
  const exercises = rows.map(row => byName.get(row.exerciseName) ?? fallbackExercise(row.exerciseName));
  const target = rows.find(row => row.groupUsed)?.groupUsed ?? GENERATOR_MUSCLE_GROUPS.find(group => exercises.length > 0 && exercises.every(exercise => exercise.muscles.includes(group))) ?? defaultGroup(exercises[0] ?? fallbackExercise(''));
  const slots = type === 'Muscle Group Split' ? mgsSlots(target, volume) : findStructure({ type, volume }).slots;
  const slotByKey = new Map(slots.map(slot => [slot.slotKey, slot]));
  const used = new Set<string>();
  const names = new Set<string>();

  const entries = rows.map((row) => {
    const exercise = byName.get(row.exerciseName) ?? fallbackExercise(row.exerciseName);
    const exact = slotByKey.get(row.slotKey);
    const slot = exact && !used.has(exact.slotKey) ? exact : slots.find(candidate => !used.has(candidate.slotKey) && matchesSlot(exercise, [...candidate.allowedGroupIds, ...candidate.alternativeGroupIds], candidate.requiredSlotTag));
    if (slot) used.add(slot.slotKey);
    const isRepeat = names.has(exercise.name);
    names.add(exercise.name);
    return {
      slotKey: slot?.slotKey ?? row.slotKey,
      exercise,
      groupUsed: slot !== undefined ? groupUsedFor(exercise, slot) : defaultGroup(exercise),
      isRepeat,
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
