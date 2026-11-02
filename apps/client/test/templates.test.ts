import { describe, expect, it } from 'vitest';
import { copyTitle } from '../src/lib/templates';

describe('copyTitle', () => {
  it('добавляет суффикс «· копия» к исходному имени', () => {
    expect(copyTitle('Мой пуш', new Set())).toBe('Мой пуш · копия');
  });

  it('не наследует суффикс копии у копии', () => {
    expect(copyTitle('Мой пуш · копия', new Set())).toBe('Мой пуш · копия');
    expect(copyTitle('Мой пуш · копия 2', new Set())).toBe('Мой пуш · копия');
  });

  it('нумерует повторные копии, если имя занято', () => {
    const taken = new Set(['Мой пуш · копия', 'Мой пуш · копия 2']);
    expect(copyTitle('Мой пуш', taken)).toBe('Мой пуш · копия 3');
  });

  it('пропускает промежуточные номера до первого свободного', () => {
    const taken = new Set(['Мой пуш · копия', 'Мой пуш · копия 2', 'Мой пуш · копия 3']);
    expect(copyTitle('Мой пуш', taken)).toBe('Мой пуш · копия 4');
  });

  it('не нумерует первую копию, даже если в наборе есть другие имена', () => {
    expect(copyTitle('Мой пуш', new Set(['Жимы']))).toBe('Мой пуш · копия');
  });
});
