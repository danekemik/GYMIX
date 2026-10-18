import type { SetEntry } from './session';

export function weightValue(value: string): string | null {
  const clean = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean) || Number(clean) > 9999.99) return null;
  return clean;
}
export function repsValue(value: string): number | null {
  const clean = value.trim();
  const number = Number(clean);
  return /^\d+$/.test(clean) && Number.isInteger(number) && number > 0 && number <= 2_147_483_647 ? number : null;
}
export function setInputErrors(set: Pick<SetEntry, 'weight' | 'reps'>) {
  return {
    weight: set.weight.trim() !== '' && weightValue(set.weight) === null ? 'Вес: число от 0 до 9999,99, до двух знаков после запятой.' : undefined,
    reps: repsValue(set.reps) === null ? 'Укажи целое число повторений больше нуля.' : undefined,
  };
}
export function validSetInput(set: Pick<SetEntry, 'weight' | 'reps'>) {
  const errors = setInputErrors(set);
  return !errors.weight && !errors.reps;
}
