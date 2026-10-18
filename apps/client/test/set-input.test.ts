import { expect, it } from 'vitest';
import { repsValue, validSetInput, weightValue } from '../src/domain/setInput';

it('accepts Russian decimal input and bodyweight sets without external load', () => {
  expect(weightValue(' 42,50 ')).toBe('42.50');
  expect(validSetInput({ weight: '', reps: '8' })).toBe(true);
  expect(validSetInput({ weight: '0', reps: '12' })).toBe(true);
});
it('rejects malformed, negative, overflowing and empty completed values', () => {
  for (const value of ['-5', '1e3', '10000', '42.555', 'Infinity', 'текст']) expect(weightValue(value)).toBeNull();
  for (const value of ['', '8abc', '1.5', '0', '-1', '2147483648']) expect(repsValue(value)).toBeNull();
  expect(validSetInput({ weight: '', reps: '' })).toBe(false);
});
