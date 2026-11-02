import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readBuilderPreferences, saveBuilderPreferences } from '../src/lib/builderPreferences';

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps preferences private to each account and excludes exercise selections', () => {
  saveBuilderPreferences('first', { type: 'Push', volume: 'Компактная', selections: { s1: 'Example' } });
  expect(readBuilderPreferences('first')).toEqual({ type: 'Push', volume: 'Компактная' });
  expect(readBuilderPreferences('second')).toBeUndefined();
});
it('rejects malformed or obsolete preferences instead of breaking quick start', () => {
  for (const value of ['{', 'null', '{"type":"__proto__","volume":"Стандартная"}', '{"type":"Push","volume":"Huge"}', '{"type":"Muscle Group Split","volume":"Компактная","mgsGroup":"Unknown"}']) {
    storage.set('gymix:builder:first', value);
    expect(readBuilderPreferences('first')).toBeUndefined();
  }
});
it('keeps manual creation available when browser storage is unavailable', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } });
  expect(readBuilderPreferences('first')).toBeUndefined();
  expect(() => saveBuilderPreferences('first', { type: 'Push', volume: 'Компактная' })).not.toThrow();
});
