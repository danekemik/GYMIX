import { GENERATOR_MUSCLE_GROUPS, MATRIX } from '@gymix/structures';
import type { Draft } from './draft';

const key = (userId: string) => `gymix:builder:${userId}`;
export function readBuilderPreferences(userId: string): Draft | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) ?? 'null');
    if (!value || !Object.hasOwn(MATRIX, value.type) || !['Компактная', 'Стандартная', 'Расширенная'].includes(value.volume)) return;
    if (value.type === 'Muscle Group Split' && !GENERATOR_MUSCLE_GROUPS.includes(value.mgsGroup)) return;
    return { type: value.type, volume: value.volume, ...(value.type === 'Muscle Group Split' ? { mgsGroup: value.mgsGroup } : {}) };
  } catch { return; }
}
export function saveBuilderPreferences(userId: string, draft: Draft): void {
  try { localStorage.setItem(key(userId), JSON.stringify({ type: draft.type, volume: draft.volume, mgsGroup: draft.mgsGroup })); } catch { /* The builder also works when browser storage is unavailable. */ }
}
