import type { Slot } from '@gymix/structures';

export function renderGroupLabel(slot: Slot, index: number): string {
  const groups = slot.allowedGroupIds;
  if (groups.length === 0) return `Группа ${index + 1}`;
  return groups[0] ?? `Группа ${index + 1}`;
}

export function hasAlternatives(slot: Slot): boolean {
  return slot.alternativeGroupIds.length > 0;
}