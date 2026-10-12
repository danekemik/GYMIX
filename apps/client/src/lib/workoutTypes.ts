import {
  MATRIX,
  STRUCTURES,
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