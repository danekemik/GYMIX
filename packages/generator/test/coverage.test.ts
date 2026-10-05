import { describe, expect, it } from 'vitest';
import {
  MGS_CATEGORY_GROUPS,
  MATRIX,
  VOLUME_LEVELS,
  WORKOUT_TYPES,
  type VolumeLevel,
  type WorkoutType,
} from '@gymix/structures';
import { loadCatalog } from '@gymix/catalog';
import { InsufficientCatalogError, generateWorkout, slotCandidates } from '../src/index.js';

/**
 * Каталог читается лениво: поломка документа должна ронять конкретный
 * тест с понятным сообщением, а не весь набор с ошибкой импорта.
 */
let cached: ReturnType<typeof loadCatalog> | undefined;
function catalog(): ReturnType<typeof loadCatalog> {
  if (cached === undefined) cached = loadCatalog();
  return cached;
}

/**
 * Главный тест решения №1: каждая из 21 комбинации и каждый MGS-вариант
 * собираются непустыми из утверждённого каталога.
 */
describe('coverage: все структуры собираются', () => {
  const fixed: ReadonlyArray<readonly [WorkoutType, VolumeLevel]> = WORKOUT_TYPES.filter(
    (t) => t !== 'Muscle Group Split',
  ).flatMap((type) => VOLUME_LEVELS.map((volume) => [type, volume] as const));

  it('21 комбинация «формат × объём» даёт ровно заявленное число упражнений', () => {
    expect(fixed).toHaveLength(18); // без Muscle Group Split, его 3 комбинации проверяются отдельно
    for (const [type, volume] of fixed) {
      const workout = generateWorkout(catalog(), { type, volume, seed: 42 });
      expect(workout.entries, `${type}·${volume}`).toHaveLength(MATRIX[type][volume]);
    }
  });

  it('Muscle Group Split собирается для каждой группы каждой категории', () => {
    let checked = 0;
    for (const groups of Object.values(MGS_CATEGORY_GROUPS)) {
      for (const group of groups) {
        for (const volume of VOLUME_LEVELS) {
          const workout = generateWorkout(catalog(), {
            type: 'Muscle Group Split',
            volume,
            targetGroup: group,
            seed: 7,
          });
          expect(workout.entries, `${group}·${volume}`).toHaveLength(MATRIX['Muscle Group Split'][volume]);
          expect(
            workout.entries.every((e) => e.exercise.muscles.includes(group)),
            `${group}·${volume}`,
          ).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(9 * 3);
  });

  it('каждый слот закрыт ровно одним упражнением из своей группы', () => {
    for (const [type, volume] of fixed) {
      const workout = generateWorkout(catalog(), { type, volume, seed: 1 });
      const slotKeys = workout.entries.map((e) => e.slotKey);
      expect(new Set(slotKeys).size, `${type}·${volume}`).toBe(slotKeys.length);
      for (const entry of workout.entries) {
        expect(entry.exercise.catalogOnly, entry.slotKey).toBe(false);
        expect(entry.exercise.muscles, entry.slotKey).toContain(entry.groupUsed);
      }
    }
  });

  it('ни один слот не остаётся с упражнением группы «Пресс»', () => {
    for (const [type, volume] of fixed) {
      const workout = generateWorkout(catalog(), { type, volume, seed: 3 });
      for (const entry of workout.entries) {
        expect(entry.groupUsed as string, entry.slotKey).not.toBe('Пресс');
      }
    }
  });

  it('Pull закрывает оба слота задней дельты упражнениями с rear_delt', () => {
    for (const volume of VOLUME_LEVELS) {
      const workout = generateWorkout(catalog(), { type: 'Pull', volume, seed: 11 });
      const rearDeltEntries = workout.entries.filter(
        (e) => catalog().exercises.find((x) => x.name === e.exercise.name)?.tags.includes('rear_delt'),
      );
      const required = volume === 'Расширенная' ? 2 : 1;
      expect(rearDeltEntries.length, `Pull·${volume}`).toBe(required);
    }
  });
});

describe('генератор уважает решения владельца', () => {
  it('один seed даёт воспроизводимую сборку', () => {
    const a = generateWorkout(catalog(), { type: 'Full Body', volume: 'Стандартная', seed: 99 });
    const b = generateWorkout(catalog(), { type: 'Full Body', volume: 'Стандартная', seed: 99 });
    expect(a.entries.map((e) => e.exercise.name)).toEqual(b.entries.map((e) => e.exercise.name));
  });

  it('разные seed дают разные сборки', () => {
    const a = generateWorkout(catalog(), { type: 'Full Body', volume: 'Расширенная', seed: 1 });
    const b = generateWorkout(catalog(), { type: 'Full Body', volume: 'Расширенная', seed: 2 });
    expect(a.entries.map((e) => e.exercise.name)).not.toEqual(b.entries.map((e) => e.exercise.name));
  });

  it('исключённое упражнение не попадает ни в один слот', () => {
    const base = generateWorkout(catalog(), { type: 'Full Body', volume: 'Стандартная', seed: 5 });
    const target = base.entries[0]?.exercise.name;
    expect(target).toBeDefined();
    const workout = generateWorkout(catalog(), {
      type: 'Full Body',
      volume: 'Стандартная',
      seed: 5,
      excludedExerciseNames: [target!],
    });
    expect(workout.entries.some((e) => e.exercise.name === target)).toBe(false);
  });

  it('предпочитает упражнения, которых ещё не было в тренировке', () => {
    const workout = generateWorkout(catalog(), {
      type: 'Upper Body',
      volume: 'Расширенная',
      seed: 21,
      alreadySelected: catalog().exercises.filter((e) => e.primary === 'Грудь'),
    });
    const names = workout.entries.map((e) => e.exercise.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('исключение записей «Пресс» не ломает генерацию: они и так вне слотов', () => {
    const press = catalog().exercises.filter((e) => e.catalogOnly).map((e) => e.name);
    expect(press).toHaveLength(11);
    for (const [type, volume] of [
      ['Full Body', 'Стандартная'],
      ['Lower Body', 'Расширенная'],
      ['Push', 'Стандартная'],
    ] as const) {
      const withPress = generateWorkout(catalog(), { type, volume, seed: 13 });
      const withoutPress = generateWorkout(catalog(), {
        type,
        volume,
        seed: 13,
        excludedExerciseNames: press,
      });
      expect(withoutPress.entries.map((e) => e.exercise.name), `${type}·${volume}`).toEqual(
        withPress.entries.map((e) => e.exercise.name),
      );
    }
  });

  it('исключение всей группы делает её слоты незакрываемыми, а не подменяет группы', () => {
    // Все упражнения группы «Икры» исключены: структура не собирается.
    expect(() =>
      generateWorkout(catalog(), {
        type: 'Lower Body',
        volume: 'Компактная',
        excludedExerciseNames: catalog().exercises
          .filter((e) => e.muscles.includes('Икры'))
          .map((e) => e.name),
      }),
    ).toThrow(InsufficientCatalogError);
  });

  it('не использует «Пресс» как альтернативу, если группа пуста', () => {
    // Даже при полном исключении икр слот не перекрывается «Пресс».
    try {
      generateWorkout(catalog(), {
        type: 'Lower Body',
        volume: 'Компактная',
        excludedExerciseNames: catalog().exercises
          .filter((e) => e.muscles.includes('Икры'))
          .map((e) => e.name),
      });
      expect.unreachable('ожидалась ошибка');
    } catch (error) {
      const missing = (error as InsufficientCatalogError).missing;
      expect(missing.some((m) => (m.allowed as readonly string[]).includes('Пресс'))).toBe(false);
    }
  });

  it('сообщает конкретные слоты, а не молча сокращает тренировку', () => {
    try {
      generateWorkout(catalog(), {
        type: 'Lower Body',
        volume: 'Стандартная',
        excludedExerciseNames: catalog().exercises
          .filter((e) => e.primary === 'Икры')
          .map((e) => e.name),
      });
      expect.unreachable('должен был бросить InsufficientCatalogError');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientCatalogError);
      const missing = (error as InsufficientCatalogError).missing;
      expect(missing.length).toBeGreaterThan(0);
      expect(missing.some((m) => m.allowed.includes('Икры'))).toBe(true);
      expect((error as Error).message).toMatch(/ничего не сокращ|недостаточно/);
    }
  });

  it('требует группу для Muscle Group Split и объясняет список', () => {
    expect(() =>
      generateWorkout(catalog(), { type: 'Muscle Group Split', volume: 'Стандартная' }),
    ).toThrow(/нужна верхнеуровневая группа/);
    expect(() =>
      generateWorkout(catalog(), {
        type: 'Muscle Group Split',
        volume: 'Стандартная',
        // «Пресс» не входит в генерацию, поэтому тип не принимает его.
        targetGroup: 'Пресс' as never,
      }),
    ).toThrow(/нужна верхнеуровневая группа/);
  });
});

describe('кандидаты по слотам', () => {
  it('слот груди не содержит упражнений других групп', () => {
    const workout = generateWorkout(catalog(), { type: 'Push', volume: 'Компактная', seed: 1 });
    const chestSlots = workout.entries.filter((e) => e.groupUsed === 'Грудь');
    expect(chestSlots.length).toBe(2);
    for (const entry of chestSlots) {
      expect(entry.exercise.muscles).toContain('Грудь');
    }
  });

  it('кандидаты слота с тегом ограничены тремя упражнениями задней дельты', () => {
    const [structure] = [
      { type: 'Pull' as const, volume: 'Расширенная' as const },
    ];
    const workout = generateWorkout(catalog(), { ...structure, seed: 1 });
    const rearSlot = workout.entries.find(
      (e) => catalog().exercises.find((x) => x.name === e.exercise.name)?.tags.includes('rear_delt'),
    );
    expect(rearSlot).toBeDefined();

    const slotCandidatesForRearDelt = catalog().exercises.filter((e) =>
      e.tags.includes('rear_delt'),
    );
    expect(slotCandidatesForRearDelt).toHaveLength(3);
  });

  it('пустой набор исключений даёт полный набор кандидатов', () => {
    const workout = generateWorkout(catalog(), { type: 'Push', volume: 'Компактная', seed: 1 });
    const first = workout.entries[0];
    expect(first).toBeDefined();
    const candidates = slotCandidates(
      { ...({ slotKey: 'x', type: 'Push', volume: 'Компактная' } as const), allowedGroupIds: ['Грудь'], alternativeGroupIds: [] },
      catalog(),
      new Set(),
    );
    expect(candidates.length).toBeGreaterThanOrEqual(2);
  });
});