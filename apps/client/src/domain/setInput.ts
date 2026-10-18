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
  const clean = set.weight.trim().replace(',', '.');
  const weightError = Number(clean) > 9999.99 ? 'Вес не должен превышать 9999,99 кг.' : /^\d+\.\d{3,}$/.test(clean) ? 'Укажи вес с точностью до двух знаков после запятой.' : 'Укажи вес числом от нуля, например 42,5.';
  return {
    weight: clean !== '' && weightValue(set.weight) === null ? weightError : undefined,
    reps: repsValue(set.reps) === null ? 'Укажи целое число повторений больше нуля.' : undefined,
  };
}
export function validSetInput(set: Pick<SetEntry, 'weight' | 'reps'>) {
  const errors = setInputErrors(set);
  return !errors.weight && !errors.reps;
}
