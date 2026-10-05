import { describe, expect, it } from 'vitest';
import { VOLUME_LEVELS, WORKOUT_TYPES, MATRIX } from '@gymix/structures';
import { loadCatalog } from '@gymix/catalog';
import { generateWorkout, InsufficientCatalogError, slotCandidates } from '../src/index.js';

/** Опции без MGS-группы: exactOptionalPropertyTypes не терпит `undefined`. */
function opts(type: (typeof WORKOUT_TYPES)[number], volume: (typeof VOLUME_LEVELS)[number]) {
  return type === 'Muscle Group Split'
    ? { type, volume, targetGroup: 'Грудь' as const }
    : { type, volume };
}

/**
 * Мутационный тест: каталог испорчен во временной копии, а тесты на
 * боевой файл обязаны остаться зелёными. Доказывает, что проверки
 * действительно зависят от данных, а не от случайного совпадения.
 */
describe('генератор реагирует на испорченный каталог', () => {
  const catalog = loadCatalog();

  it('структура без кандидатов роняет генерацию с перечислением слотов', () => {
    const broken = {
      ...catalog,
      exercises: catalog.exercises.filter((e) => !e.muscles.includes('Икры')),
    };
    expect(() =>
      generateWorkout(broken, { type: 'Lower Body', volume: 'Расширенная' }),
    ).toThrow(InsufficientCatalogError);

    try {
      generateWorkout(broken, { type: 'Lower Body', volume: 'Расширенная' });
    } catch (error) {
      const missing = (error as InsufficientCatalogError).missing;
      expect(missing).toHaveLength(2);
      expect(missing.every((m) => m.allowed.includes('Икры'))).toBe(true);
    }
  });

  it('потеря rear_delt оставляет слот Pull незакрываемым', () => {
    const broken = {
      ...catalog,
      exercises: catalog.exercises.map((e) =>
        e.tags.includes('rear_delt') ? { ...e, tags: [] } : e,
      ),
    };
    expect(() =>
      generateWorkout(broken, { type: 'Pull', volume: 'Расширенная' }),
    ).toThrow(/недостаточно/);
  });

  it('все 21 комбинация собираются из полного каталога, но не из неполного', () => {
    const full: string[] = [];
    for (const type of WORKOUT_TYPES) {
      for (const volume of VOLUME_LEVELS) {
        try {
          const workout = generateWorkout(catalog, opts(type, volume));
          expect(workout.entries).toHaveLength(MATRIX[type][volume]);
          full.push(`${type}·${volume}`);
        } catch {
          throw new Error(`${type}·${volume} не собралась из полного каталога`);
        }
      }
    }
    expect(full).toHaveLength(21);
    expect(full).toContain('Muscle Group Split·Расширенная');

    // Убираем одну группу целиком: минимум одна структура обязана сломаться.
    const withoutCalves = {
      ...catalog,
      exercises: catalog.exercises.filter((e) => !e.muscles.includes('Икры')),
    };
    const broken: string[] = [];
    for (const type of WORKOUT_TYPES) {
      for (const volume of VOLUME_LEVELS) {
        try {
          generateWorkout(withoutCalves, opts(type, volume));
        } catch {
          broken.push(`${type}·${volume}`);
        }
      }
    }
    expect(broken).toContain('Lower Body·Расширенная');
    expect(broken).toContain('Legs·Компактная');
  });

  it('кандидаты слота пусты, когда группа исчезла из каталога', () => {
    const withoutTriceps = {
      ...catalog,
      exercises: catalog.exercises.filter((e) => !e.muscles.includes('Трицепс')),
    };
    const slot = {
      slotKey: 'test',
      type: 'Push' as const,
      volume: 'Стандартная' as const,
      allowedGroupIds: ['Трицепс' as const],
      alternativeGroupIds: [],
    };
    expect(slotCandidates(slot, withoutTriceps, new Set())).toEqual([]);
    expect(slotCandidates(slot, catalog, new Set()).length).toBeGreaterThan(0);
  });
});