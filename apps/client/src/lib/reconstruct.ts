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
  const assigned = new Map<number, Slot>();
  const owners = new Map<string, number>();
  const fixed = new Set<number>();
  const fits = (index: number, slot: Slot) => matchesSlot(exercises[index]!, [...slot.allowedGroupIds, ...slot.alternativeGroupIds], slot.requiredSlotTag);
  rows.forEach((row, index) => {
    const slot = slotByKey.get(row.slotKey);
    if (slot && !owners.has(slot.slotKey) && fits(index, slot)) {
      assigned.set(index, slot); owners.set(slot.slotKey, index); fixed.add(index);
    }
  });
  // Historical rows only have positions. A greedy match can consume a broad
  // slot needed by a later exercise, leaving an otherwise valid plan broken.
  const place = (index: number, visited: Set<string>): boolean => {
    for (const slot of slots) {
      if (visited.has(slot.slotKey) || !fits(index, slot)) continue;
      visited.add(slot.slotKey);
      const owner = owners.get(slot.slotKey);
      if (owner === undefined || (!fixed.has(owner) && place(owner, visited))) {
        assigned.set(index, slot); owners.set(slot.slotKey, index); return true;
      }
    }
    return false;
  };
  rows.forEach((_, index) => { if (!assigned.has(index)) place(index, new Set()); });
  rows.forEach((_, index) => {
    if (assigned.has(index)) return;
    const slot = slots.find(candidate => !owners.has(candidate.slotKey));
    if (slot) { assigned.set(index, slot); owners.set(slot.slotKey, index); }
  });
  const names = new Set<string>();

  const entries = rows.map((row, index) => {
    const exercise = byName.get(row.exerciseName) ?? fallbackExercise(row.exerciseName);
    const slot = assigned.get(index);
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
