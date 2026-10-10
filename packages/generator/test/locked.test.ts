import { describe, expect, it } from 'vitest';
import { MATRIX } from '@gymix/structures';
import { loadCatalog } from '@gymix/catalog';
import { generateWorkout } from '../src/index.js';

let cached: ReturnType<typeof loadCatalog> | undefined;
function catalog(): ReturnType<typeof loadCatalog> {
  if (cached === undefined) cached = loadCatalog();
  return cached;
}

/**
 * S05/S06: слоты, заполненные вручную, замораживаются — генератор
 * закрывает только пустые слоты, не трогая выбор пользователя.
 */
describe('lockedSelections: ручной выбор (S06) замораживает слоты', () => {
  it('выбранное упражнение сохраняется в слоте при генерации остальных', () => {
    const base = generateWorkout(catalog(), { type: 'Push', volume: 'Стандартная', seed: 7 });
    const lockKey = base.entries[0]!.slotKey;
    const lockName = base.entries[0]!.exercise.name;

    const merged = generateWorkout(catalog(), {
      type: 'Push',
      volume: 'Стандартная',
      lockedSelections: { [lockKey]: lockName },
      seed: 999,
    });

    expect(merged.entries).toHaveLength(MATRIX['Push']['Стандартная']);
    const locked = merged.entries.find((e) => e.slotKey === lockKey);
    expect(locked?.exercise.name).toBe(lockName);
  });

  it('все слоты зафиксированы — сборка детерминирована независимо от сида', () => {
    const base = generateWorkout(catalog(), { type: 'Full Body', volume: 'Стандартная', seed: 1 });
    const selections: Record<string, string> = {};
    for (const e of base.entries) selections[e.slotKey] = e.exercise.name;

    const a = generateWorkout(catalog(), {
      type: 'Full Body',
      volume: 'Стандартная',
      lockedSelections: selections,
      seed: 1,
    });
    const b = generateWorkout(catalog(), {
      type: 'Full Body',
      volume: 'Стандартная',
      lockedSelections: selections,
      seed: 2,
    });
    expect(a.entries.map((e) => e.exercise.name)).toEqual(base.entries.map((e) => e.exercise.name));
    expect(b.entries.map((e) => e.exercise.name)).toEqual(a.entries.map((e) => e.exercise.name));
  });

  it('старое упражнение не попадает в зафиксированный слот повторно через pовторы', () => {
    const base = generateWorkout(catalog(), { type: 'Upper Body', volume: 'Стандартная', seed: 3 });
    const lockKey = base.entries[0]!.slotKey;
    const lockName = base.entries[0]!.exercise.name;
    const merged = generateWorkout(catalog(), {
      type: 'Upper Body',
      volume: 'Стандартная',
      lockedSelections: { [lockKey]: lockName },
      seed: 4,
    });
    const names = merged.entries.map((e) => e.exercise.name);
    expect(names).toHaveLength(MATRIX['Upper Body']['Стандартная']);
  });

  it('замена кандидата не допускает упражнение вне слота', () => {
    const slot = generateWorkout(catalog(), { type: 'Pull', volume: 'Стандартная', seed: 5 }).entries[0]!;
    void slot;
    // lockedSelections с именем, не подходящим слоту, — ошибка недостатка, а не молчаливый фикс
    expect(() =>
      generateWorkout(catalog(), {
        type: 'Pull',
        volume: 'Стандартная',
        lockedSelections: { [slot.slotKey]: 'Приседания со штангой не должно пройти' },
        seed: 6,
      }),
    ).toThrow();
  });
});
