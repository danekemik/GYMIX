import {
  findStructure,
  GENERATOR_MUSCLE_GROUPS,
  mgsSlots,
  type GeneratorMuscleGroup,
  type Slot,
  type VolumeLevel,
  type WorkoutType,
} from '@gymix/structures';
import { matchesSlot, type Catalog, type CatalogExercise } from '@gymix/catalog/parse';

export interface GenerateOptions {
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  /** Для Muscle Group Split: какая верхнеуровневая группа набирается. */
  readonly targetGroup?: GeneratorMuscleGroup;
  /** Упражнения, отмеченные «Не предлагать». Полностью исключаются из подбора. */
  readonly excludedExerciseNames?: readonly string[];
  /**
   * Упражнения, уже выбранные в других слотах этой же сборки или в
   * предыдущих тренировках. Используются, чтобы не предлагать дубли, но
   * не являются жёстким запретом: если кандидат только один — берётся он.
   */
  readonly alreadySelected?: readonly CatalogExercise[];
  readonly seed?: number;
}

export interface GeneratedEntry {
  readonly slotKey: string;
  readonly exercise: CatalogExercise;
  /** Чем группа слота закрыта: основной или альтернативной. */
  readonly groupUsed: GeneratorMuscleGroup;
  /** Упражнение повторяет уже выбранное — сигнал для UI. */
  readonly isRepeat: boolean;
}

export interface GeneratedWorkout {
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  readonly entries: readonly GeneratedEntry[];
}

/**
 * Каталога не хватило, чтобы закрыть структуру. Спецификация запрещает
 * в этом случае молча сокращать тренировку, поэтому сообщаем список.
 */
export class InsufficientCatalogError extends Error {
  constructor(readonly missing: readonly InsufficientSlot[]) {
    super(
      `утверждённого каталога недостаточно: ${missing.length} слотов без кандидата — ` +
        missing.map((m) => m.slotKey).join(', '),
    );
    this.name = 'InsufficientCatalogError';
  }
}

export interface InsufficientSlot {
  readonly slotKey: string;
  readonly allowed: readonly GeneratorMuscleGroup[];
  readonly requiredTag?: string;
  readonly reason: 'пусто' | 'все исключены' | 'только повторы';
}

/** Детерминированный PRNG: одна сборка воспроизводится по seed. */
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * Кандидаты для слота: группа входит в основные или альтернативы слота,
 * требуемый тег выставлен, упражнение не исключено.
 */
export function slotCandidates(
  slot: Slot,
  catalog: Catalog,
  excluded: ReadonlySet<string>,
): CatalogExercise[] {
  const allowed = [...slot.allowedGroupIds, ...slot.alternativeGroupIds];
  return catalog.exercises.filter(
    (e) => !excluded.has(e.name) && matchesSlot(e, allowed, slot.requiredSlotTag),
  );
}

/**
 * Кандидаты, ещё не выбранные в этой сборке. Если таких нет, слот
 * закрывается повтором — но только если это последний возможный вариант.
 */
function rankCandidates(
  candidates: readonly CatalogExercise[],
  usedNames: ReadonlySet<string>,
  previouslySelected: ReadonlySet<string>,
  rng: () => number,
): CatalogExercise[] {
  const scored = candidates.map((exercise) => {
    let score = rng();
    if (usedNames.has(exercise.name)) score -= 1000;
    if (previouslySelected.has(exercise.name)) score -= 100;
    return { exercise, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.exercise);
}

export function slotGroupUsed(exercise: CatalogExercise, slot: Slot): GeneratorMuscleGroup {
  const forPrimary = slot.allowedGroupIds.find((g) => exercise.muscles.includes(g));
  if (forPrimary !== undefined) return forPrimary;
  const forAlternative = slot.alternativeGroupIds.find((g) => exercise.muscles.includes(g));
  if (forAlternative !== undefined) return forAlternative;
  throw new Error(`упражнение «${exercise.name}» не принадлежит ни одной группе слота ${slot.slotKey}`);
}

/**
 * Слот структуры по устойчивому ключу. Нужен, чтобы открыть список замен
 * для уже сгенерированного упражнения: зная `slotKey` и draft, слот
 * восстанавливается детерминированно.
 */
export function slotFor(
  slotKey: string,
  type: WorkoutType,
  volume: VolumeLevel,
  targetGroup?: GeneratorMuscleGroup,
): Slot {
  const slots: readonly Slot[] =
    type === 'Muscle Group Split'
      ? mgsSlots(requireTargetGroup(targetGroup), volume)
      : findStructure({ type, volume }).slots;
  const slot = slots.find((s) => s.slotKey === slotKey);
  if (slot === undefined) {
    throw new Error(`слот ${slotKey} не найден для ${type} · ${volume}`);
  }
  return slot;
}

/**
 * Кандидаты на замену упражнения в слоте (S09). Текущее упражнение и все
 * «не предлагать» исключены; уже занятые в этой сборке группы не
 * запрещены, но уходят в конец — пользователь сам решает, допустить ли повтор.
 */
export function replacementCandidates(
  catalog: Catalog,
  slot: Slot,
  currentName: string,
  excludedNames: ReadonlySet<string>,
  takenNames: ReadonlySet<string>,
): CatalogExercise[] {
  const restricted = new Set(excludedNames);
  restricted.add(currentName);
  const base = slotCandidates(slot, catalog, restricted);
  const sorted = [...base].sort((a, b) => {
    const aTaken = takenNames.has(a.name) ? 1 : 0;
    const bTaken = takenNames.has(b.name) ? 1 : 0;
    if (aTaken !== bTaken) return aTaken - bTaken;
    return a.name.localeCompare(b.name, 'ru');
  });
  return sorted;
}

export function generateWorkout(
  catalog: Catalog,
  options: GenerateOptions,
): GeneratedWorkout {
  const slots: readonly Slot[] =
    options.type === 'Muscle Group Split'
      ? mgsSlots(requireTargetGroup(options.targetGroup), options.volume)
      : findStructure({ type: options.type, volume: options.volume }).slots;

  const excluded = new Set(options.excludedExerciseNames ?? []);
  const previouslySelected = new Set((options.alreadySelected ?? []).map((e) => e.name));
  const rng = makeRng(options.seed ?? hash(`${options.type}·${options.volume}`));

  const usedNames = new Set<string>();
  const entries: GeneratedEntry[] = [];
  const missing: InsufficientSlot[] = [];

  for (const slot of slots) {
    const candidates = slotCandidates(slot, catalog, excluded);
    if (candidates.length === 0) {
      missing.push({
        slotKey: slot.slotKey,
        allowed: [...slot.allowedGroupIds, ...slot.alternativeGroupIds],
        ...(slot.requiredSlotTag ? { requiredTag: slot.requiredSlotTag } : {}),
        reason: excluded.size > 0 ? 'все исключены' : 'пусто',
      });
      continue;
    }

    const ranked = rankCandidates(candidates, usedNames, previouslySelected, rng);
    const fresh = ranked.filter((e) => !usedNames.has(e.name));
    const picked = fresh[0] ?? ranked[0];
    if (picked === undefined) continue;

    entries.push({
      slotKey: slot.slotKey,
      exercise: picked,
      groupUsed: slotGroupUsed(picked, slot),
      isRepeat: usedNames.has(picked.name),
    });
    usedNames.add(picked.name);
  }

  if (missing.length > 0) {
    throw new InsufficientCatalogError(missing);
  }

  return { type: options.type, volume: options.volume, entries };
}

function requireTargetGroup(group: GeneratorMuscleGroup | undefined): GeneratorMuscleGroup {
  if (group === undefined || !GENERATOR_MUSCLE_GROUPS.includes(group)) {
    throw new Error(
      `для Muscle Group Split нужна верхнеуровневая группа из: ${GENERATOR_MUSCLE_GROUPS.join(', ')}`,
    );
  }
  return group;
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}