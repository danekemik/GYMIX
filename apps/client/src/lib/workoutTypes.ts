import {
  MATRIX,
  MGS_CATEGORIES,
  STRUCTURES,
  type MgsCategory,
  type WorkoutType,
} from '@gymix/structures';

export interface WorkoutTypeCard {
  readonly type: WorkoutType;
  /** Уникальные группы охвата по «Стандартной» структуре. */
  readonly groups: readonly string[];
  readonly counts: readonly [number, number, number];
}

/**
 * Карточки типов для S01 — собираются из живых данных `@gymix/structures`.
 * Охват групп и числа упражнений (Компактная/Стандартная/Расширенная)
 * берутся из матрицы, а не захардкожены.
 */
export function workoutTypeCards(): WorkoutTypeCard[] {
  return STRUCTURES.filter((s) => s.volume === 'Стандартная').map((structure) => {
    const groups = [...new Set(structure.slots.flatMap((slot) => slot.allowedGroupIds))];
    const counts = (['Компактная', 'Стандартная', 'Расширенная'] as const).map(
      (volume) => MATRIX[structure.type][volume],
    ) as [number, number, number];
    return { type: structure.type, groups, counts };
  });
}

export function isMgs(type: WorkoutType): boolean {
  return type === 'Muscle Group Split';
}

/** Русские названия категорий второго шага Muscle Group Split. */
export const MGS_CATEGORY_LABELS: Record<MgsCategory, string> = {
  Chest: 'Грудь',
  Back: 'Спина',
  Shoulders: 'Плечи',
  Legs: 'Ноги',
  Arms: 'Руки',
};

/**
 * Группы мышц для предпросмотра в строке формата.
 * Muscle Group Split на этом шаге не разложен по группам — показываем
 * категории, из которых пользователь выберет одну на втором шаге.
 */
export function previewGroups(card: WorkoutTypeCard): readonly string[] {
  return isMgs(card.type)
    ? MGS_CATEGORIES.map((category) => MGS_CATEGORY_LABELS[category])
    : card.groups;
}

/** Человекочитаемые названия типов для списков (история, главная). */
const TYPE_LABEL: Record<WorkoutType, string> = {
  'Full Body': 'Full Body',
  'Upper Body': 'Верх тела',
  'Lower Body': 'Низ тела',
  Push: 'Жимы',
  Pull: 'Тяги',
  Legs: 'Ноги',
  'Muscle Group Split': 'Одна группа',
};

/** Название типа по ключу; неизвестный ключ возвращаем как есть. */
export function typeLabel(type: string): string {
  return (TYPE_LABEL as Record<string, string>)[type] ?? type;
}