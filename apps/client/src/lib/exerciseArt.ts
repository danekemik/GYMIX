/**
 * Иллюстрации упражнений.
 *
 * Контурные схемы — набор Everkinetic (CC BY-SA 4.0); фотографии — free-exercise-db
 * (Unlicense). Источники и лицензии: `src/assets/exercises/NOTICE.md`.
 *
 * Файлы лежат в `assets/exercises/<slug>.webp` и подключаются по slug через
 * таблицу соответствия каноническому названию упражнения.
 */
const artUrls = import.meta.glob('../assets/exercises/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const bySlug = new Map<string, string>();
for (const [path, url] of Object.entries(artUrls)) {
  bySlug.set(path.slice(path.lastIndexOf('/') + 1).replace(/\.webp$/, ''), url);
}

/** Каноническое название упражнения → slug файла иллюстрации. */
const NAME_TO_SLUG: Record<string, string> = {
  'Жим штанги лёжа': 'bench-press',
  'Жим гантелей лёжа': 'bench-press-dumbbell',
  'Жим штанги на наклонной скамье': 'incline-bench-press',
  'Жим гантелей на наклонной скамье': 'incline-dumbbell-press',
  'Жим в Chest Press': 'machine-bench-press',
  'Жим в Смите лёжа': 'smith-machine-bench-press',
  'Жим в Смите на наклонной скамье': 'smith-machine-incline-bench-press',
  'Разводка с гантелями лёжа': 'dumbbell-flys',
  'Сведение рук в Pec Deck': 'butterfly-machine',
  'Сведение рук в кроссовере': 'cable-crossover',
  'Сведение рук в кроссовере снизу вверх': 'cable-crossover',
  'Отжимания от пола': 'push-ups',
  'Отжимания на брусьях': 'chest-dips',
  'Жим гантелей нейтральным хватом': 'bench-press-dumbbell',
  'Подтягивания': 'pull-ups',
  'Подтягивания обратным хватом': 'chin-ups',
  'Подтягивания нейтральным хватом': 'narrow-parallel-grip-chin-ups',
  'Подтягивания с противовесом': 'pull-ups',
  'Тяга верхнего блока к груди': 'wide-grip-lat-pull-down',
  'Тяга верхнего блока обратным хватом': 'underhand-pull-down',
  'Тяга верхнего блока узким хватом': 'v-bar-pull-down',
  'Горизонтальная тяга в тренажёре': 'seated-cable-rows',
  'Горизонтальная тяга нижнего блока': 'seated-cable-rows',
  'Тяга штанги в наклоне': 'reverse-grips-bent-over-barbell-rows',
  'Тяга гантели одной рукой': 'rear-deltoid-row-dumbbell',
  'Тяга гантелей в наклоне': 'rear-deltoid-row-dumbbell',
  'Тяга Т-грифа': 't-bar-rows',
  'Тяга с упором грудью': 'seated-cable-rows',
  'Тяга верхнего блока прямыми руками': 'straight-arm-push-down',
  'Пуловер с гантелью': 'dumbbell-bent-arm-pullover',
  'Пуловер на верхнем блоке': 'straight-arm-push-down',
  'Шраги со штангой': 'barbell-shrugs',
  'Шраги с гантелями': 'shoulder-shrugs',
  'Жим гантелей сидя': 'dumbbell-shoulder-press',
  'Жим гантелей стоя': 'one-arm-dumbbell-shoulder-press',
  'Жим в Shoulder Press': 'seated-shoulder-press-machine',
  'Жим в Смите сидя': 'seated-military-press',
  'Подъём гантелей в стороны': 'lateral-dumbbell-raises',
  'Подъём рук в стороны в тренажёре': 'lateral-dumbbell-raises',
  'Подъём одной руки в сторону на блоке': 'lateral-dumbbell-raises',
  'Разведение гантелей в наклоне': 'bent-over-rear-deltoid-raise-with-head-on-bench',
  'Обратная бабочка': 'lying-rear-lateral-raise',
  'Подъём гантелей перед собой': 'front-dumbbell-raise',
  'Подъём одной руки перед собой на блоке': 'front-cable-raises',
  'Подъём штанги на бицепс': 'bicep-curls-with-barbell',
  'Подъём EZ-штанги на бицепс': 'ez-bar-curl-with-barbell',
  'Подъём гантелей на бицепс': 'biceps-curl-with-dumbbell',
  'Молотки с гантелями': 'bicep-hammer-curl-with-dumbbell',
  'Молотки с канатом': 'hammer-curls-with-rope-and-cable',
  'Подъём гантели на бицепс сидя': 'seated-bicep-curl-with-dumbbell',
  'Подъём EZ-штанги на скамье Скотта': 'preacher-curl-with-barbell',
  'Сгибание рук в тренажёре': 'bicep-curl-with-machine',
  'Сгибание рук на нижнем блоке': 'standing-biceps-curl-with-cable',
  'Разгибание рук на верхнем блоке': 'triceps-pushdown-with-cable',
  'Разгибание рук на блоке с канатом': 'triceps-pushdown-with-rope-and-cable',
  'Разгибание одной руки на блоке': 'one-arm-tricep-extension-with-cable',
  'Французский жим лёжа со штангой': 'lying-triceps-press-with-barbell',
  'Французский жим с EZ-штангой': 'lying-close-grip-triceps-extension-behind-the-head-with-barbell',
  'Разгибание гантели из-за головы': 'seated-triceps-press-with-dumbbell',
  'Разгибание руки с гантелью назад': 'triceps-kickback-with-dumbbell',
  'Жим узким хватом': 'close-grip-barbell-bench-press',
  'Разгибание рук в тренажёре': 'triceps-extensions-using-machine',
  'Приседания со штангой': 'barbell-squat',
  'Фронтальные приседания': 'front-squat-with-barbell',
  'Гакк-приседания': 'hack-squat-machine',
  'Маятниковые приседания': 'smith-machine-hack-squat',
  'Жим ногами': 'leg-press',
  'Приседания в Смите': 'smith-machine-squats',
  'Goblet Squat': 'squats-using-dumbbells',
  'Выпады с гантелями': 'dumbbell-lunges',
  'Выпады со штангой': 'barbell-lunges',
  'Выпады назад': 'rear-lunges-with-dumbbell',
  'Выпады в ходьбе': 'walking-lunges',
  'Step-up': 'step-ups-with-dumbbells',
  'Разгибание ног': 'leg-extensions',
  'Румынская тяга со штангой': 'romanian-dead-lift',
  'Румынская тяга с гантелями': 'dumbbell-dead-lifts',
  'Сгибание ног лёжа': 'lying-leg-curl-machine',
  'Сгибание ног сидя': 'seated-leg-curl',
  'Сгибание одной ноги стоя': 'standing-leg-curls',
  'Good Morning': 'barbell-good-mornings',
  'Гиперэкстензия': 'hyperextensions',
  'Гиперэкстензия с отягощением': 'back-extension-stability-ball',
  'Hip Thrust со штангой': 'bridging',
  'Ягодичный мост со штангой': 'bridging',
  'Ягодичный мост с гантелью': 'bridging',
  'Hip Thrust в тренажёре': 'bridging',
  'Отведение ноги назад в тренажёре': 'one-legged-cable-kickback',
  'Отведение ноги назад на блоке': 'one-legged-cable-kickback',
  'Отведение ноги в сторону на блоке': 'thigh-abductor',
  'Отведение бедра в тренажёре': 'thigh-abductor',
  'Подъём на носки стоя': 'standing-barbell-calf-raise',
  'Подъём на носки в тренажёре': 'standing-calf-raises-using-machine',
  'Подъём на носки сидя': 'seated-calf-raise-using-machine',
  'Подъём на носки со штангой': 'rocking-standing-calf-raise-with-barbell',
  'Подъём на носки с гантелями': 'standing-barbell-calf-raise',
  'Подъём на носки одной ногой': 'seated-one-leg-calf-raise-with-dumbbell',
  'Скручивания': 'crunches',
  'Скручивания на скамье': 'decline-crunch',
  'Скручивания в тренажёре': 'seated-ab-crunch-with-cable',
  'Подъём коленей в упоре': 'bent-knee-hip-raise',
  'Подъём прямых ног в упоре': 'flat-bench-leg-raises',
  'Bicycle Crunch': 'air-bike',
};

/**
 * Каноническое название → slug фотографии (free-exercise-db, Unlicense).
 * Для упражнений, которых нет в наборе Everkinetic.
 */
const NAME_TO_PHOTO: Record<string, string> = {
  'High Row': 'high-row',
  'Face Pull': 'face-pull',
  'Жим штанги стоя': 'standing-barbell-press',
  'Болгарские приседания': 'bulgarian-split-squat',
  'Подъём ног в висе': 'hanging-leg-raise',
  'Планка': 'plank',
  'Pallof Press': 'pallof-press',
  'Russian Twist': 'russian-twist',
  'Wood Chop': 'cable-wood-chop',
  'Румынская тяга на одной ноге': 'single-leg-deadlift',
};

const PHOTO_SLUGS = new Set<string>(Object.values(NAME_TO_PHOTO));

/** Иллюстрация упражнения: `line` — контурная схема, `photo` — фотография. */
export interface ExerciseArt {
  src: string;
  kind: 'line' | 'photo';
}

/** Иллюстрация упражнения или `undefined`, если её ещё нет. */
export function exerciseArt(name: string): ExerciseArt | undefined {
  const slug = NAME_TO_SLUG[name] ?? NAME_TO_PHOTO[name];
  if (slug === undefined) return undefined;
  const src = bySlug.get(slug);
  if (src === undefined) return undefined;
  return { src, kind: PHOTO_SLUGS.has(slug) ? 'photo' : 'line' };
}
