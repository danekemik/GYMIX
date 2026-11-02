import type { CatalogExercise } from '@gymix/catalog/parse';
import { generateWorkout, type GeneratedWorkout } from '@gymix/generator';
import type { GeneratorMuscleGroup, VolumeLevel, WorkoutType } from '@gymix/structures';
import type { SetEntry } from '../domain/session';
import { getCatalog } from './catalog';
import type { GymixDb } from './db';
import { saveSessionLocalOnly } from './session';

/**
 * Демо-история для разработки: 10 завершённых тренировок за последние
 * четыре недели. Заполнение однократное и только в dev, чтобы можно было
 * посмотреть «Последние тренировки», историю, запись и графики прогресса
 * с правдоподобными данными.
 *
 * Данные пишутся только в локальную PGlite, без очереди синхронизации:
 * демо-записи не должны попадать в аккаунт на сервере.
 */
const DEMO_KEY = 'gymix:demo-seeded-v2';

interface DemoSpec {
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  readonly targetGroup?: GeneratorMuscleGroup;
  /** Фиксированный seed делает состав тренировки воспроизводимым. */
  readonly seed: number;
  readonly daysAgo: number;
  /** Часы, вычтенные из «сейчас»: разное время занятий. */
  readonly hoursAgo: number;
  readonly durationMin: number;
  /** Последнее упражнение пропущено целиком. */
  readonly skipLast?: boolean;
  /** У последнего упражнения выполнены не все подходы. */
  readonly partialLast?: boolean;
}

const DEMO_SPECS: readonly DemoSpec[] = [
  { type: 'Full Body', volume: 'Компактная', seed: 101, daysAgo: 29, hoursAgo: 2, durationMin: 30 },
  { type: 'Upper Body', volume: 'Стандартная', seed: 202, daysAgo: 26, hoursAgo: 5, durationMin: 38 },
  { type: 'Lower Body', volume: 'Стандартная', seed: 303, daysAgo: 23, hoursAgo: 1, durationMin: 45 },
  { type: 'Push', volume: 'Компактная', seed: 404, daysAgo: 20, hoursAgo: 7, durationMin: 27 },
  { type: 'Pull', volume: 'Стандартная', seed: 505, daysAgo: 17, hoursAgo: 3, durationMin: 40 },
  { type: 'Full Body', volume: 'Стандартная', seed: 606, daysAgo: 13, hoursAgo: 6, durationMin: 49 },
  { type: 'Upper Body', volume: 'Расширенная', seed: 707, daysAgo: 10, hoursAgo: 2, durationMin: 54, skipLast: true },
  { type: 'Lower Body', volume: 'Расширенная', seed: 808, daysAgo: 8, hoursAgo: 8, durationMin: 58 },
  { type: 'Push', volume: 'Стандартная', seed: 909, daysAgo: 3, hoursAgo: 4, durationMin: 35, partialLast: true },
  { type: 'Muscle Group Split', volume: 'Расширенная', targetGroup: 'Спина', seed: 111, daysAgo: 1, hoursAgo: 1, durationMin: 42 },
];

/**
 * Рабочий вес упражнения на текущем уровне. Это не «вес из каталога», а
 * правдоподобная нагрузка для демо: база относится к снаряду и движению,
 * а не к одной мышечной группе.
 */
const WEIGHT_BY_NAME: Readonly<Record<string, number>> = {
  'Step-up': 0,
  'Румынская тяга со штангой': 75,
  'Жим ногами': 120,
  'Жим в Смите на наклонной скамье': 60,
  'Пуловер с гантелью': 20,
  'Жим штанги стоя': 38,
  'Разгибание гантели из-за головы': 18,
  'Жим гантелей нейтральным хватом': 26,
  'Отжимания от пола': 0,
  'Тяга гантели одной рукой': 32,
  'Тяга верхнего блока узким хватом': 55,
  'Face Pull': 25,
  'Подъём EZ-штанги на скамье Скотта': 25,
  'Разгибание рук в тренажёре': 32,
  'Гакк-приседания': 85,
  'Приседания в Смите': 72,
  'Good Morning': 42,
  'Сгибание ног сидя': 40,
  'Goblet Squat': 26,
  'Подъём на носки со штангой': 80,
  'Жим гантелей лёжа': 28,
  'Жим гантелей на наклонной скамье': 26,
  'Жим гантелей сидя': 20,
  'Разгибание рук на верхнем блоке': 27,
  'Тяга верхнего блока прямыми руками': 32,
  'High Row': 58,
  'Тяга верхнего блока к груди': 58,
  'Подтягивания обратным хватом': 0,
  'Выпады с гантелями': 20,
  'Hip Thrust со штангой': 90,
  'Горизонтальная тяга в тренажёре': 55,
  'Жим в Смите сидя': 45,
  'Сгибание рук на нижнем блоке': 20,
  'Разгибание одной руки на блоке': 16,
  'Жим штанги лёжа': 68,
  'Шраги со штангой': 70,
  'Подъём гантелей перед собой': 10,
  'Жим гантелей стоя': 20,
  'Подъём штанги на бицепс': 30,
  'Гиперэкстензия': 0,
  'Румынская тяга на одной ноге': 20,
  'Румынская тяга с гантелями': 24,
  'Подъём на носки стоя': 0,
  'Подъём на носки с гантелями': 24,
  'Сведение рук в Pec Deck': 40,
  'Подъём одной руки в сторону на блоке': 10,
  'Тяга гантелей в наклоне': 30,
  'Подтягивания': 0,
  'Тяга штанги в наклоне': 65,
};

/** Запасной расчёт для упражнений, которых ещё нет в карте весов. */
const GROUP_BASE_WEIGHT: Readonly<Record<string, number>> = {
  'Квадрицепс': 70,
  'Задняя поверхность бедра': 55,
  'Ягодичные': 60,
  'Спина': 50,
  'Грудь': 50,
  'Плечи': 30,
  'Бицепс': 22,
  'Трицепс': 28,
  'Икры': 50,
  'Пресс': 0,
};

const MACHINE_EQUIPMENT = new Set([
  'Abdominal Machine',
  'Biceps Curl',
  'Calf Machine',
  'Chest Press',
  'Glute Machine',
  'Hack Squat',
  'High Row',
  'Hip Abductor',
  'Lat Pulldown',
  'Lateral Raise',
  'Leg Extension',
  'Leg Press',
  'Lying / Leg Curl',
  'Lying Leg Curl',
  'Pec Deck',
  'Pendulum Squat',
  'Plate Loaded Row',
  'Rear Delt',
  'Seated Leg Curl',
  'Seated Row',
  'Shoulder Press',
  'Triceps Extension',
  'Vertical Leg Raise',
]);

const ISOLATION_RE = /разгибание|сгибание|сведение|разводка|подъём|подъем|шраги|пуловер|face pull|бабочка/i;

function fallbackWeight(exercise: CatalogExercise): number {
  const weighted = exercise.equipment.some(
    (item) =>
      item === 'Штанга' ||
      item === 'Гантели' ||
      item === 'Гантель' ||
      item === 'EZ-штанга' ||
      item === 'Машина Смита' ||
      item === 'Верхний блок' ||
      item === 'Нижний блок' ||
      item === 'Кроссовер' ||
      MACHINE_EQUIPMENT.has(item),
  );
  if (!weighted) return 0;

  const base = GROUP_BASE_WEIGHT[exercise.primary] ?? 30;
  let factor = 0.85;
  if (exercise.equipment.includes('Штанга')) factor = 1;
  else if (exercise.equipment.includes('Машина Смита')) factor = 0.85;
  else if (exercise.equipment.includes('Leg Press')) factor = 1.6;
  else if (exercise.equipment.includes('Hack Squat') || exercise.equipment.includes('Pendulum Squat')) factor = 0.85;
  else if (exercise.equipment.includes('EZ-штанга')) factor = 0.8;
  else if (exercise.equipment.includes('Верхний блок') || exercise.equipment.includes('Нижний блок') || exercise.equipment.includes('Кроссовер')) factor = 0.6;
  else if (exercise.equipment.includes('Гантели') || exercise.equipment.includes('Гантель')) factor = 0.4;
  else if (exercise.equipment.includes('Leg Extension') || exercise.equipment.includes('Lying / Leg Curl') || exercise.equipment.includes('Lying Leg Curl') || exercise.equipment.includes('Seated Leg Curl')) factor = 0.65;
  return base * factor;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Прогрессия от первой тренировки к десятой: старые веса чуть ниже. */
function progressionFor(index: number): number {
  return 0.9 + index * 0.016;
}

function setCount(volume: VolumeLevel, exerciseIndex: number): number {
  if (volume === 'Расширенная') return exerciseIndex < 2 ? 4 : 3;
  if (volume === 'Стандартная') return exerciseIndex === 0 ? 4 : 3;
  return 3;
}

function weightRamp(count: number): readonly number[] {
  if (count >= 4) return [0.8, 0.875, 0.95, 1];
  if (count === 3) return [0.85, 0.925, 1];
  if (count === 2) return [0.9, 1];
  return [1];
}

function repScheme(count: number, exercise: CatalogExercise, topWeight: number): number[] {
  if (topWeight === 0) {
    return count >= 4 ? [15, 12, 10, 8] : [12, 10, 8];
  }
  if (exercise.primary === 'Икры') {
    return count >= 4 ? [20, 18, 16, 15] : [20, 18, 15];
  }
  if (ISOLATION_RE.test(exercise.name)) {
    return count >= 4 ? [15, 14, 12, 12] : [15, 12, 12];
  }
  return count >= 4 ? [12, 10, 8, 6] : [10, 8, 8];
}

function setsForExercise(
  exercise: CatalogExercise,
  exerciseIndex: number,
  volume: VolumeLevel,
  progression: number,
  partial: boolean,
): SetEntry[] {
  const count = setCount(volume, exerciseIndex);
  const base = WEIGHT_BY_NAME[exercise.name] ?? fallbackWeight(exercise);
  const top = base === 0 ? 0 : roundHalf(base * progression);
  const reps = repScheme(count, exercise, top);
  return weightRamp(count).map((ratio, setIndex) => ({
    // Собственный вес храним как «—», а не как 0 кг: так его показывает запись.
    weight: top === 0 ? '' : formatKg(roundHalf(top * ratio)),
    reps: String(reps[setIndex] ?? reps[reps.length - 1] ?? 10),
    done: !(partial && setIndex === count - 1),
  }));
}

function buildPayload(spec: DemoSpec, progression: number) {
  const workout: GeneratedWorkout = generateWorkout(getCatalog(), {
    type: spec.type,
    volume: spec.volume,
    seed: spec.seed,
    ...(spec.targetGroup !== undefined ? { targetGroup: spec.targetGroup } : {}),
  });

  const last = workout.entries.length - 1;
  const sets = workout.entries.map((entry, index) =>
    setsForExercise(entry.exercise, index, spec.volume, progression, spec.partialLast === true && index === last),
  );
  const skippedExercises = workout.entries.map((_, index) => spec.skipLast === true && index === last);
  const durationMs = spec.durationMin * 60_000;
  const endedAt = Date.now() - spec.daysAgo * 86_400_000 - spec.hoursAgo * 3_600_000;

  return {
    workout,
    sets,
    skippedExercises,
    startedAt: endedAt - durationMs,
    endedAt,
    durationMs,
  };
}

export function ensureDemoSeed(db: GymixDb): void {
  if (!import.meta.env.DEV || typeof localStorage === 'undefined' || typeof navigator === 'undefined') return;
  // Playwright выставляет webdriver: браузерные тесты должны видеть пустую историю.
  if (navigator.webdriver === true) return;

  if (pendingSeeds.has(db)) return;
  const pending = doSeed(db)
    .catch(() => undefined)
    .finally(() => pendingSeeds.delete(db));
  pendingSeeds.set(db, pending);
}

const pendingSeeds = new WeakMap<GymixDb, Promise<void>>();

async function doSeed(db: GymixDb): Promise<void> {
  try {
    if (localStorage.getItem(DEMO_KEY) !== null) return;

    // Собираем всё заранее: если каталог не даст собрать тренировку,
    // в базе не останется половины демо-истории.
    const payloads = DEMO_SPECS.map((spec, index) => buildPayload(spec, progressionFor(index)));
    for (const payload of payloads) await saveSessionLocalOnly(db, payload);
    localStorage.setItem(DEMO_KEY, '1');
  } catch {
    // Демо-заполнение не должно мешать работе приложения.
  }
}
