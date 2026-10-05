import type {
  GeneratorMuscleGroup,
  Structure,
  StructureKey,
  Slot,
  VolumeLevel,
  WorkoutType,
} from './types.js';

const FULL_BODY: Record<VolumeLevel, readonly GeneratorMuscleGroup[]> = {
  'Компактная': ['Квадрицепс', 'Задняя поверхность бедра', 'Ягодичные', 'Грудь', 'Спина', 'Плечи'],
  'Стандартная': ['Квадрицепс', 'Задняя поверхность бедра', 'Ягодичные', 'Грудь', 'Спина', 'Спина', 'Плечи', 'Бицепс', 'Трицепс'],
  'Расширенная': ['Квадрицепс', 'Задняя поверхность бедра', 'Ягодичные', 'Грудь', 'Грудь', 'Спина', 'Спина', 'Плечи', 'Бицепс', 'Трицепс'],
};

const UPPER_BODY: Record<VolumeLevel, readonly GeneratorMuscleGroup[]> = {
  'Компактная': ['Грудь', 'Спина', 'Спина', 'Плечи', 'Бицепс', 'Трицепс'],
  'Стандартная': ['Грудь', 'Грудь', 'Спина', 'Спина', 'Плечи', 'Бицепс', 'Трицепс'],
  'Расширенная': ['Грудь', 'Грудь', 'Спина', 'Спина', 'Спина', 'Плечи', 'Плечи', 'Бицепс', 'Трицепс'],
};

const LOWER_BODY: Record<VolumeLevel, readonly GeneratorMuscleGroup[]> = {
  'Компактная': ['Квадрицепс', 'Квадрицепс', 'Задняя поверхность бедра', 'Ягодичные', 'Икры'],
  'Стандартная': ['Квадрицепс', 'Квадрицепс', 'Задняя поверхность бедра', 'Задняя поверхность бедра', 'Ягодичные', 'Икры'],
  'Расширенная': ['Квадрицепс', 'Квадрицепс', 'Задняя поверхность бедра', 'Задняя поверхность бедра', 'Ягодичные', 'Ягодичные', 'Икры', 'Икры'],
};

const PUSH: Record<VolumeLevel, readonly GeneratorMuscleGroup[]> = {
  'Компактная': ['Грудь', 'Грудь', 'Плечи', 'Трицепс'],
  'Стандартная': ['Грудь', 'Грудь', 'Плечи', 'Плечи', 'Трицепс', 'Трицепс'],
  'Расширенная': ['Грудь', 'Грудь', 'Грудь', 'Плечи', 'Плечи', 'Трицепс', 'Трицепс'],
};

/**
 * Pull: спина ×2/3/3; задняя дельта ×1/1/2; бицепс ×1/2/2.
 * Слот задней дельты не является одиннадцатой верхнеуровневой группой —
 * это тег `rear_delt` внутри группы «Плечи».
 */
const PULL: Record<VolumeLevel, readonly SlotSpec[]> = {
  'Компактная': [
    { group: 'Спина' }, { group: 'Спина' },
    { group: 'Плечи', tag: 'rear_delt' },
    { group: 'Бицепс' },
  ],
  'Стандартная': [
    { group: 'Спина' }, { group: 'Спина' }, { group: 'Спина' },
    { group: 'Плечи', tag: 'rear_delt' },
    { group: 'Бицепс' }, { group: 'Бицепс' },
  ],
  'Расширенная': [
    { group: 'Спина' }, { group: 'Спина' }, { group: 'Спина' },
    { group: 'Плечи', tag: 'rear_delt' }, { group: 'Плечи', tag: 'rear_delt' },
    { group: 'Бицепс' }, { group: 'Бицепс' },
  ],
};

const LEGS: Record<VolumeLevel, readonly GeneratorMuscleGroup[]> = {
  'Компактная': ['Квадрицепс', 'Квадрицепс', 'Задняя поверхность бедра', 'Ягодичные', 'Икры'],
  'Стандартная': ['Квадрицепс', 'Квадрицепс', 'Задняя поверхность бедра', 'Задняя поверхность бедра', 'Ягодичные', 'Икры'],
  'Расширенная': ['Квадрицепс', 'Квадрицепс', 'Задняя поверхность бедра', 'Задняя поверхность бедра', 'Ягодичные', 'Ягодичные', 'Икры', 'Икры'],
};

/** Сколько упражнений получает Muscle Group Split: 3/4/5 для одной группы. */
const MGS_COUNTS: Record<VolumeLevel, number> = {
  'Компактная': 3,
  'Стандартная': 4,
  'Расширенная': 5,
};

/** Одна позиция в раскладке структуры. */
interface SlotSpec {
  readonly group: GeneratorMuscleGroup;
  readonly alternatives?: readonly GeneratorMuscleGroup[];
  readonly tag?: 'rear_delt';
}

/**
 * Порядок слотов в структуре. Нумерация по порядку в раскладке,
 * поэтому «спина ×2» в Full Body · Стандартная даёт слоты 5 и 6.
 */
function slotKey(type: WorkoutType, volume: VolumeLevel, index: number): string {
  return `${type}·${volume}·s${index + 1}`;
}

function buildSlots(
  type: WorkoutType,
  volume: VolumeLevel,
  specs: readonly SlotSpec[],
): Slot[] {
  return specs.map((spec, index) => ({
    slotKey: slotKey(type, volume, index),
    type,
    volume,
    allowedGroupIds: [spec.group],
    alternativeGroupIds: spec.alternatives ?? [],
    ...(spec.tag ? { requiredSlotTag: spec.tag } : {}),
  }));
}

/**
 * Раскладка слотов задаётся списком, а не количествами, потому что
 * один слот может отличаться от соседей тегом или альтернативами.
 */
function groupSpecs(groups: readonly GeneratorMuscleGroup[]): SlotSpec[] {
  return groups.map((group) => ({ group }));
}

/**
 * Структуры, собранные из раскладки слотов, утверждённой в
 * `reference/product_logic.md`. Число упражнений не задаётся вручную:
 * оно равно сумме слотов, поэтому разойтись не могут.
 */
function buildStructures(): Structure[] {
  const out: Structure[] = [];

  const plain: ReadonlyArray<readonly [WorkoutType, Record<VolumeLevel, readonly GeneratorMuscleGroup[]>]> = [
    ['Full Body', FULL_BODY],
    ['Upper Body', UPPER_BODY],
    ['Lower Body', LOWER_BODY],
    ['Push', PUSH],
    ['Legs', LEGS],
  ];

  for (const [type, layout] of plain) {
    for (const volume of ['Компактная', 'Стандартная', 'Расширенная'] as const) {
      let specs: SlotSpec[] = groupSpecs(layout[volume]);
      if (type === 'Full Body' && volume === 'Компактная') {
        // «Руки: бицепс или трицепс» — один слот с альтернативами,
        // а не два отдельных слота.
        specs = [...specs, { group: 'Бицепс', alternatives: ['Бицепс', 'Трицепс'] }];
      }
      const slots = buildSlots(type, volume, specs);
      out.push({ type, volume, exerciseCount: slots.length, slots });
    }
  }

  // Pull собирается отдельно: у него есть слот с тегом rear_delt.
  for (const volume of ['Компактная', 'Стандартная', 'Расширенная'] as const) {
    const slots = buildSlots('Pull', volume, PULL[volume]);
    out.push({ type: 'Pull', volume, exerciseCount: slots.length, slots });
  }

  for (const volume of ['Компактная', 'Стандартная', 'Расширенная'] as const) {
    const count = MGS_COUNTS[volume];
    // Muscle Group Split — одна выбранная группа; слоты создаются под неё.
    const slots: Slot[] = Array.from({ length: count }, (_, index) => ({
      slotKey: `Muscle Group Split·${volume}·s${index + 1}`,
      type: 'Muscle Group Split',
      volume,
      allowedGroupIds: [],
      alternativeGroupIds: [],
    }));
    out.push({
      type: 'Muscle Group Split',
      volume,
      exerciseCount: slots.length,
      slots,
    });
  }

  return out;
}

/** Все 19 утверждённых комбинаций «формат × объём». */
export const STRUCTURES: readonly Structure[] = buildStructures();

/** Матрица ровно в том виде, как она записана в спецификации. */
export const MATRIX: Readonly<Record<WorkoutType, Readonly<Record<VolumeLevel, number>>>> = {
  'Full Body': { 'Компактная': 7, 'Стандартная': 9, 'Расширенная': 10 },
  'Upper Body': { 'Компактная': 6, 'Стандартная': 7, 'Расширенная': 9 },
  'Lower Body': { 'Компактная': 5, 'Стандартная': 6, 'Расширенная': 8 },
  'Push': { 'Компактная': 4, 'Стандартная': 6, 'Расширенная': 7 },
  'Pull': { 'Компактная': 4, 'Стандартная': 6, 'Расширенная': 7 },
  'Legs': { 'Компактная': 5, 'Стандартная': 6, 'Расширенная': 8 },
  'Muscle Group Split': { 'Компактная': 3, 'Стандартная': 4, 'Расширенная': 5 },
};

export function findStructure(key: StructureKey): Structure {
  const found = STRUCTURES.find((s) => s.type === key.type && s.volume === key.volume);
  if (!found) {
    throw new Error(`нет утверждённой структуры для ${key.type} · ${key.volume}`);
  }
  return found;
}

export function matrixEntry(type: WorkoutType, volume: VolumeLevel): number {
  return MATRIX[type][volume];
}

/** Набор слотов Muscle Group Split под конкретную выбранную группу. */
export function mgsSlots(targetGroup: GeneratorMuscleGroup, volume: VolumeLevel): Slot[] {
  const base = findStructure({ type: 'Muscle Group Split', volume });
  return base.slots.map((slot) => ({
    ...slot,
    slotKey: slot.slotKey,
    allowedGroupIds: [targetGroup],
  }));
}