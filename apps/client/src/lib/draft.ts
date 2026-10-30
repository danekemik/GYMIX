import {
  MATRIX,
  findStructure,
  mgsSlots,
  type GeneratorMuscleGroup,
  type Slot,
  type Structure,
  type VolumeLevel,
  type WorkoutType,
} from '@gymix/structures';
import { isMgs } from './workoutTypes';

/** Черновик сборки: тип → (MGS-группа) → объём. */
export interface Draft {
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  readonly mgsGroup?: GeneratorMuscleGroup;
  /** Слоты, заполненные вручную (S06): slotKey → имя упражнения. */
  readonly selections?: Readonly<Record<string, string>>;
}

/** Сколько слотов уже заполнено вручную. */
export function filledSlotCount(draft: Draft): number {
  return Object.keys(draft.selections ?? {}).length;
}

/** Итоговая структура по черновику. Для MGS слоты заполняются группой. */
export function structureFor(draft: Draft): Structure {
  if (isMgs(draft.type)) {
    if (!draft.mgsGroup) return findStructure({ type: 'Muscle Group Split', volume: draft.volume });
    const slots = mgsSlots(draft.mgsGroup, draft.volume);
    return { type: draft.type, volume: draft.volume, exerciseCount: slots.length, slots };
  }
  return findStructure({ type: draft.type, volume: draft.volume });
}

/** Число упражнений из матрицы — единственное утверждённое число. */
export function exerciseCount(draft: Draft): number {
  return MATRIX[draft.type][draft.volume];
}

/**
 * Русские склонения: plural(5, ['упражнение', 'упражнения', 'упражнений'])
 * → «упражнений».
 */
export function plural(n: number, forms: [string, string, string]): string {
  return `${n} ${pluralForm(n, forms)}`;
}

/** Только слово в нужной форме — для крупной цифры рядом с подписью. */
export function pluralForm(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Уникальные группы охвата для карточки объёма. */
export function coverageGroups(slots: readonly Slot[]): string[] {
  return [...new Set(slots.flatMap((slot) => slot.allowedGroupIds))];
}
