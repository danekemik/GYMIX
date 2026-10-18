import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generateWorkout, slotFor } from '@gymix/generator';
import { getCatalog } from '../src/lib/catalog';
import { readBuilderState, saveBuilderState, clearBuilderState, type BuilderState } from '../src/lib/builderState';
import { buildWorkoutFromEntries } from '../src/lib/reconstruct';

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
const state = (): BuilderState => ({
  step: 'preview', draft: { type: 'Push', volume: 'Компактная' }, seed: 123,
  generated: generateWorkout(getCatalog(), { type: 'Push', volume: 'Компактная', seed: 123 }),
  manualReturn: 'volume', fromTemplate: false,
});

it('restores the exact prepared order in the right account and clears it after start', () => {
  const value = state();
  value.generated = { ...value.generated!, entries: [...value.generated!.entries].reverse() };
  expect(saveBuilderState('first', value)).toBe(true);
  expect(readBuilderState('first')?.generated?.entries.map(entry => entry.exercise.name)).toEqual(value.generated.entries.map(entry => entry.exercise.name));
  expect(readBuilderState('second')).toBeUndefined();
  clearBuilderState('first'); expect(readBuilderState('first')).toBeUndefined();
});
it('restores a partially selected manual plan at the same position', () => {
  const value = state();
  const [first, second] = value.generated!.entries;
  value.step = 'manual'; value.draft = { ...value.draft, selections: { [first!.slotKey]: first!.exercise.name } };
  value.manualSlotKey = second!.slotKey; value.generated = undefined;
  saveBuilderState('first', value);
  expect(readBuilderState('first')?.draft.selections).toEqual(value.draft.selections);
  expect(readBuilderState('first')?.manualSlotKey).toBe(second!.slotKey);
});
it('keeps a muscle group split target when the exercise has multiple primary groups', () => {
  const generated = generateWorkout(getCatalog(), { type: 'Muscle Group Split', volume: 'Компактная', targetGroup: 'Ягодичные', seed: 8 });
  saveBuilderState('first', { ...state(), draft: { type: 'Muscle Group Split', volume: 'Компактная', mgsGroup: 'Ягодичные' }, generated });
  expect(readBuilderState('first')?.generated?.entries.every(entry => entry.groupUsed === 'Ягодичные')).toBe(true);
});
it('rejects corrupt drafts and remains usable without browser storage', () => {
  for (const raw of ['{', 'null', '{"version":99}', '{"version":1,"draft":{"type":"__proto__"}}']) {
    storage.set('gymix:build-draft:first', raw); expect(readBuilderState('first')).toBeUndefined();
  }
  vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } });
  expect(saveBuilderState('first', state())).toBe(false);
  expect(readBuilderState('first')).toBeUndefined();
});
it('restores canonical slot identities for a reordered historical workout', () => {
  const plan = state().generated!;
  const repeated = buildWorkoutFromEntries(plan.type, plan.volume, [...plan.entries].reverse().map((entry, index) => ({ slotKey: `s${index + 1}`, exerciseName: entry.exercise.name })));
  expect(repeated.entries.map(entry => entry.exercise.name)).toEqual([...plan.entries].reverse().map(entry => entry.exercise.name));
  for (const entry of repeated.entries) expect(() => slotFor(entry.slotKey, repeated.type, repeated.volume)).not.toThrow();
});
