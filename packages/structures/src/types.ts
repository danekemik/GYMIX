/**
 * Базовые типы предметной области.
 *
 * Источник истины по форматам — `reference/product_logic.md`,
 * по группам мышц — `reference/exercise_database.md`.
 */

/** Десять групп мышц приложения. */
export const MUSCLE_GROUPS = [
  'Грудь',
  'Спина',
  'Плечи',
  'Бицепс',
  'Трицепс',
  'Квадрицепс',
  'Задняя поверхность бедра',
  'Ягодичные',
  'Икры',
  'Пресс',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * Группы, из которых может набираться тренировка. «Пресс» в этот список
 * не входит намеренно: 11 его записей остаются в каталоге для поиска и
 * замен, но ни одна структура V1 группу «Пресс» не содержит.
 */
export const GENERATOR_MUSCLE_GROUPS = MUSCLE_GROUPS.filter(
  (g): g is Exclude<MuscleGroup, 'Пресс'> => g !== 'Пресс',
);

export type GeneratorMuscleGroup = Exclude<MuscleGroup, 'Пресс'>;

/** Семь типов тренировки. */
export const WORKOUT_TYPES = [
  'Full Body',
  'Upper Body',
  'Lower Body',
  'Push',
  'Pull',
  'Legs',
  'Muscle Group Split',
] as const;

export type WorkoutType = (typeof WORKOUT_TYPES)[number];

/** Три уровня объёма. */
export const VOLUME_LEVELS = ['Компактная', 'Стандартная', 'Расширенная'] as const;

export type VolumeLevel = (typeof VOLUME_LEVELS)[number];

/**
 * Категория, которую выбирают на первом шаге Muscle Group Split.
 * Пять категорий, как в спецификации. Core/Torso отдельной категорией
 * в V1 не включены.
 */
export const MGS_CATEGORIES = [
  'Chest',
  'Back',
  'Shoulders',
  'Legs',
  'Arms',
] as const;

export type MgsCategory = (typeof MGS_CATEGORIES)[number];

/**
 * Muscle Group Split требует второго шага: категория, затем конкретная
 * верхнеуровневая группа внутри неё.
 */
export const MGS_CATEGORY_GROUPS = {
  Chest: ['Грудь'],
  Back: ['Спина'],
  Shoulders: ['Плечи'],
  Legs: ['Квадрицепс', 'Задняя поверхность бедра', 'Ягодичные', 'Икры'],
  Arms: ['Бицепс', 'Трицепс'],
} as const satisfies Record<MgsCategory, readonly GeneratorMuscleGroup[]>;

export type MgsTargetGroup = (typeof MGS_CATEGORY_GROUPS)[MgsCategory][number];

/** Анатомические теги внутри группы. Не верхнеуровневые категории. */
export const ANATOMICAL_TAGS = ['rear_delt'] as const;

export type AnatomicalTag = (typeof ANATOMICAL_TAGS)[number];

/**
 * Один слот структуры тренировки.
 *
 * Инвариант: слот закрывается ровно одной мышечной группой, а каждое
 * упражнение занимает ровно один слот. Счётчик `count` всегда равен 1 —
 * если нужно два упражнения одной группы, это два отдельных слота.
 */
export interface Slot {
  /** Устойчивый ключ внутри структуры, для дедупликации в синхронизации. */
  readonly slotKey: string;
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  /** Группы, которыми этот слот может быть закрыт. Ровно одна на слот. */
  readonly allowedGroupIds: readonly GeneratorMuscleGroup[];
  /**
   * Допустимые группы, если основная недоступна. Из них выбирается одна,
   * но одновременно две группы слот всё равно не занимают.
   */
  readonly alternativeGroupIds: readonly GeneratorMuscleGroup[];
  /** Обязательный анатомический тег, например `rear_delt`. */
  readonly requiredSlotTag?: AnatomicalTag;
}

/** Пара «формат × объём»: один из 19 вариантов. */
export interface StructureKey {
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
}

/** Каноническая матрица: 7 типов × 3 объёма минус полный набор — 19 строк. */
export interface Structure {
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  /** Число упражнений, равное сумме слотов. Единственное утверждённое число. */
  readonly exerciseCount: number;
  readonly slots: readonly Slot[];
}