/**
 * Иллюстрации упражнений.
 *
 * Единый набор — Open Exercise Art (CC BY-SA 4.0). Источник и лицензия:
 * `src/assets/exercises/NOTICE.md`.
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
  'Жим гантелей лёжа': 'dumbbell-bench-press',
  'Жим штанги на наклонной скамье': 'incline-bench-press',
  'Жим гантелей на наклонной скамье': 'incline-dumbbell-press',
  'Жим в Chest Press': 'machine-chest-press',
  'Жим в Смите лёжа': 'smith-machine-bench-press',
  'Жим в Смите на наклонной скамье': 'smith-machine-incline-bench-press',
  'Разводка с гантелями лёжа': 'dumbbell-fly',
  'Сведение рук в Pec Deck': 'pec-deck',
  'Сведение рук в кроссовере': 'cable-fly',
  'Сведение рук в кроссовере снизу вверх': 'cable-fly',
  'Отжимания от пола': 'push-up',
  'Отжимания на брусьях': 'dip',
  'Жим гантелей нейтральным хватом': 'dumbbell-bench-press',
  'Подтягивания': 'pull-up',
  'Подтягивания обратным хватом': 'chin-up',
  'Подтягивания нейтральным хватом': 'neutral-grip-pull-up',
  'Подтягивания с противовесом': 'assisted-pull-up',
  'Тяга верхнего блока к груди': 'lat-pulldown',
  'Тяга верхнего блока обратным хватом': 'close-grip-lat-pulldown',
  'Тяга верхнего блока узким хватом': 'close-grip-lat-pulldown',
  'Горизонтальная тяга в тренажёре': 'machine-row',
  'Горизонтальная тяга нижнего блока': 'seated-cable-row',
  'Тяга штанги в наклоне': 'barbell-row',
  'Тяга гантели одной рукой': 'dumbbell-row',
  'Тяга гантелей в наклоне': 'dumbbell-bent-over-row',
  'Тяга Т-грифа': 't-bar-row',
  'Тяга с упором грудью': 'chest-supported-row',
  'Тяга верхнего блока прямыми руками': 'straight-arm-pulldown',
  'Пуловер с гантелью': 'dumbbell-pullover',
  'Пуловер на верхнем блоке': 'straight-arm-pulldown',
  'Шраги со штангой': 'barbell-shrug',
  'Шраги с гантелями': 'dumbbell-shrug',
  'Жим гантелей сидя': 'dumbbell-shoulder-press',
  'Жим гантелей стоя': 'standing-dumbbell-press',
  'Жим в Shoulder Press': 'machine-shoulder-press',
  'Жим в Смите сидя': 'smith-machine-overhead-press',
  'Подъём гантелей в стороны': 'lateral-raise',
  'Подъём рук в стороны в тренажёре': 'machine-lateral-raise',
  'Подъём одной руки в сторону на блоке': 'cable-lateral-raise',
  'Разведение гантелей в наклоне': 'bent-over-rear-delt-raise',
  'Обратная бабочка': 'reverse-pec-deck',
  'Подъём гантелей перед собой': 'front-raise',
  'Подъём одной руки перед собой на блоке': 'cable-front-raise',
  'Подъём штанги на бицепс': 'barbell-curl',
  'Подъём EZ-штанги на бицепс': 'ez-bar-curl',
  'Подъём гантелей на бицепс': 'bicep-curl',
  'Молотки с гантелями': 'hammer-curl',
  'Молотки с канатом': 'rope-hammer-curl',
  'Подъём гантели на бицепс сидя': 'seated-dumbbell-curl',
  'Подъём EZ-штанги на скамье Скотта': 'barbell-preacher-curl',
  'Сгибание рук в тренажёре': 'machine-bicep-curl',
  'Сгибание рук на нижнем блоке': 'cable-curl',
  'Разгибание рук на верхнем блоке': 'triceps-pushdown',
  'Разгибание рук на блоке с канатом': 'rope-triceps-pushdown',
  'Разгибание одной руки на блоке': 'one-arm-cable-triceps-extension',
  'Французский жим лёжа со штангой': 'lying-barbell-triceps-extension-behind-the-head',
  'Французский жим с EZ-штангой': 'skull-crusher',
  'Разгибание гантели из-за головы': 'dumbbell-overhead-triceps-extension',
  'Разгибание руки с гантелью назад': 'triceps-kickback',
  'Жим узким хватом': 'close-grip-bench-press',
  'Разгибание рук в тренажёре': 'machine-triceps-extension',
  'Приседания со штангой': 'back-squat',
  'Фронтальные приседания': 'front-squat',
  'Гакк-приседания': 'hack-squat',
  'Маятниковые приседания': 'hack-squat',
  'Жим ногами': 'leg-press',
  'Приседания в Смите': 'smith-machine-squat',
  'Goblet Squat': 'goblet-squat',
  'Выпады с гантелями': 'dumbbell-lunge',
  'Выпады со штангой': 'barbell-lunge',
  'Выпады назад': 'reverse-lunge',
  'Выпады в ходьбе': 'walking-lunge',
  'Step-up': 'dumbbell-step-up',
  'Разгибание ног': 'leg-extension',
  'Румынская тяга со штангой': 'romanian-deadlift',
  'Румынская тяга с гантелями': 'dumbbell-romanian-deadlift',
  'Сгибание ног лёжа': 'lying-leg-curl',
  'Сгибание ног сидя': 'seated-leg-curl',
  'Сгибание одной ноги стоя': 'standing-leg-curl',
  'Good Morning': 'good-morning',
  'Гиперэкстензия': 'back-extension',
  'Гиперэкстензия с отягощением': 'glute-focused-back-extension',
  'Hip Thrust со штангой': 'hip-thrust',
  'Ягодичный мост со штангой': 'barbell-glute-bridge',
  'Ягодичный мост с гантелью': 'dumbbell-glute-bridge',
  'Hip Thrust в тренажёре': 'smith-machine-hip-thrust',
  'Отведение ноги назад в тренажёре': 'machine-glute-kickback',
  'Отведение ноги назад на блоке': 'cable-kickback',
  'Отведение ноги в сторону на блоке': 'cable-standing-hip-abduction',
  'Отведение бедра в тренажёре': 'hip-abduction',
  'Подъём на носки стоя': 'standing-calf-raise',
  'Подъём на носки в тренажёре': 'calf-raise',
  'Подъём на носки сидя': 'seated-calf-raise',
  'Подъём на носки со штангой': 'barbell-standing-calf-raise',
  'Подъём на носки с гантелями': 'standing-calf-raise',
  'Подъём на носки одной ногой': 'single-leg-calf-raise',
  'Скручивания': 'crunch',
  'Скручивания на скамье': 'decline-crunch',
  'Скручивания в тренажёре': 'cable-crunch',
  'Подъём коленей в упоре': 'captain-s-chair-knee-raise',
  'Подъём прямых ног в упоре': 'captain-s-chair-knee-raise',
  'Bicycle Crunch': 'bicycle-crunch',
  'High Row': 'machine-row',
  'Face Pull': 'face-pull',
  'Жим штанги стоя': 'overhead-press',
  'Болгарские приседания': 'bulgarian-split-squat',
  'Подъём ног в висе': 'hanging-leg-raise',
  'Планка': 'plank',
  'Pallof Press': 'pallof-press',
  'Russian Twist': 'russian-twist',
  'Wood Chop': 'woodchop',
  'Румынская тяга на одной ноге': 'single-leg-romanian-deadlift',
};

/** Иллюстрация упражнения. */
export interface ExerciseArt {
  src: string;
}

/** Иллюстрация упражнения или `undefined`, если её ещё нет. */
export function exerciseArt(name: string): ExerciseArt | undefined {
  const slug = NAME_TO_SLUG[name];
  if (slug === undefined) return undefined;
  const src = bySlug.get(slug);
  if (src === undefined) return undefined;
  return { src };
}
