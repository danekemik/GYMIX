import { GENERATOR_MUSCLE_GROUPS, MATRIX, VOLUME_LEVELS } from '@gymix/structures';
import type { GeneratedWorkout } from '@gymix/generator';
import { matchesSlot } from '@gymix/catalog/parse';
import { getCatalog } from './catalog';
import { structureFor, type Draft } from './draft';
import { buildWorkoutFromEntries, type StoredEntry } from './reconstruct';

export const BUILDER_STEPS = ['type', 'mgs', 'volume', 'structure', 'manual', 'randomizer', 'preview'] as const;
export type BuilderStep = typeof BUILDER_STEPS[number];
export interface BuilderState {
  step: BuilderStep;
  draft: Draft;
  seed: number;
  generated?: GeneratedWorkout | undefined;
  manualSlotKey?: string | undefined;
  manualReturn: 'volume' | 'structure' | 'preview';
  fromTemplate: boolean;
  entryOrder?: readonly string[] | undefined;
}
const key = (userId: string) => `gymix:build-draft:${userId}`;

export function readBuilderState(userId: string): BuilderState | undefined {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw || raw.length > 100_000) return;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !BUILDER_STEPS.includes(value.step) || !Object.hasOwn(MATRIX, value.draft?.type) || !VOLUME_LEVELS.includes(value.draft.volume) || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff) return;
    const { type, volume, mgsGroup } = value.draft;
    if (mgsGroup !== undefined && !GENERATOR_MUSCLE_GROUPS.includes(mgsGroup)) return;
    if (type === 'Muscle Group Split' && !mgsGroup && !['type', 'mgs'].includes(value.step)) return;
    const draft: Draft = { type, volume, ...(type === 'Muscle Group Split' && mgsGroup ? { mgsGroup } : {}) };
    const slots = structureFor(draft).slots;
    const byName = new Map(getCatalog().exercises.map(exercise => [exercise.name, exercise]));
    const selections: Record<string, string> = {};
    if (value.draft.selections !== undefined) {
      if (!value.draft.selections || typeof value.draft.selections !== 'object' || Array.isArray(value.draft.selections)) return;
      for (const [slotKey, name] of Object.entries(value.draft.selections)) {
        const slot = slots.find(slot => slot.slotKey === slotKey);
        const exercise = typeof name === 'string' ? byName.get(name) : undefined;
        if (!slot || !exercise || !matchesSlot(exercise, [...slot.allowedGroupIds, ...slot.alternativeGroupIds], slot.requiredSlotTag)) return;
        selections[slotKey] = exercise.name;
      }
    }
    let generated: GeneratedWorkout | undefined;
    if (value.entries !== undefined) {
      if (!Array.isArray(value.entries) || value.entries.length !== slots.length || value.entries.some((entry: StoredEntry) => !entry || typeof entry.slotKey !== 'string' || typeof entry.exerciseName !== 'string' || !byName.has(entry.exerciseName) || !GENERATOR_MUSCLE_GROUPS.includes(entry.groupUsed!))) return;
      generated = buildWorkoutFromEntries(type, volume, value.entries);
      const used = new Set<string>();
      for (const entry of generated.entries) {
        const slot = slots.find(slot => slot.slotKey === entry.slotKey);
        if (!slot || used.has(slot.slotKey) || !matchesSlot(entry.exercise, [...slot.allowedGroupIds, ...slot.alternativeGroupIds], slot.requiredSlotTag)) return;
        used.add(slot.slotKey);
      }
    }
    if (value.step === 'preview' && !generated) return;
    return {
      step: value.step, draft: { ...draft, selections }, seed: value.seed, generated,
      manualSlotKey: slots.some(slot => slot.slotKey === value.manualSlotKey) ? value.manualSlotKey : undefined,
      manualReturn: ['volume', 'structure', 'preview'].includes(value.manualReturn) ? value.manualReturn : 'volume',
      fromTemplate: value.fromTemplate === true,
      entryOrder: Array.isArray(value.entryOrder) && value.entryOrder.every((key: unknown) => typeof key === 'string' && slots.some(slot => slot.slotKey === key)) ? value.entryOrder : undefined,
    };
  } catch { return; }
}
export function saveBuilderState(userId: string, state: BuilderState): boolean {
  try {
    localStorage.setItem(key(userId), JSON.stringify({
      version: 1, ...state, generated: undefined,
      entries: state.generated?.entries.map(entry => ({ slotKey: entry.slotKey, exerciseName: entry.exercise.name, groupUsed: entry.groupUsed })),
    }));
    return true;
  } catch { return false; }
}
export function clearBuilderState(userId: string): void {
  try { localStorage.removeItem(key(userId)); } catch { /* A new save can replace the old draft. */ }
}
