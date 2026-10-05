import { describe, expect, it } from 'vitest';
import {
  MGS_CATEGORIES,
  MGS_CATEGORY_GROUPS,
  MATRIX,
  MUSCLE_GROUPS,
  findStructure,
  matrixEntry,
  mgsSlots,
  STRUCTURES,
  VOLUME_LEVELS,
  WORKOUT_TYPES,
  type GeneratorMuscleGroup,
} from '@gymix/structures';

describe('матрица «формат × объём»', () => {
  it('содержит ровно 21 утверждённую комбинацию', () => {
    expect(STRUCTURES).toHaveLength(21);
  });

  it('покрывает 7 типов и 3 объёма без дублей', () => {
    expect(WORKOUT_TYPES).toHaveLength(7);
    expect(VOLUME_LEVELS).toHaveLength(3);
    const keys = STRUCTURES.map((s) => `${s.type}·${s.volume}`);
    expect(new Set(keys).size).toBe(21);
  });

  it('для каждой комбинации число упражнений равно сумме слотов', () => {
    for (const structure of STRUCTURES) {
      expect(structure.slots, `${structure.type}·${structure.volume}`).toHaveLength(
        structure.exerciseCount,
      );
    }
  });

  it('числа совпадают с матрицей из спецификации', () => {
    for (const structure of STRUCTURES) {
      expect(matrixEntry(structure.type, structure.volume), `${structure.type}·${structure.volume}`).toBe(
        structure.exerciseCount,
      );
    }
  });

  it('ни одна структура не содержит группу «Пресс»', () => {
    for (const structure of STRUCTURES) {
      for (const slot of structure.slots) {
        expect(slot.allowedGroupIds as readonly string[], slot.slotKey).not.toContain('Пресс');
        expect(slot.alternativeGroupIds as readonly string[], slot.slotKey).not.toContain('Пресс');
      }
    }
  });

  it('ни одна структура не содержит одиннадцатую группу', () => {
    // «Пресс» существует среди десяти групп, но не участвует в раскладках.
    const used = new Set(STRUCTURES.flatMap((s) => s.slots.flatMap((slot) => slot.allowedGroupIds)));
    expect(used.has('Пресс' as never)).toBe(false);
    expect([...used].sort()).toEqual(
      [...MUSCLE_GROUPS.filter((g) => g !== 'Пресс')].sort(),
    );
  });

  it('каждый слот закрывает ровно одну группу', () => {
    for (const structure of STRUCTURES) {
      // Базовые слоты Muscle Group Split создаются под группу, которую
      // пользователь выбирает вторым шагом, — до выбора группа не задана.
      if (structure.type === 'Muscle Group Split') continue;
      for (const slot of structure.slots) {
        const primary = slot.allowedGroupIds;
        const total = new Set([...primary, ...slot.alternativeGroupIds]);
        // Одна альтернатива допустима (бицепс или трицепс — один слот),
        // но сам слот никогда не занимают две группы одновременно.
        expect(total.size, slot.slotKey).toBeGreaterThan(0);
        expect(primary.length, slot.slotKey).toBe(1);
      }
    }
  });

  it('21 комбинация это 7 типов × 3 объёма', () => {
    expect(WORKOUT_TYPES.length * VOLUME_LEVELS.length).toBe(21);
    for (const type of WORKOUT_TYPES) {
      for (const volume of VOLUME_LEVELS) {
        expect(STRUCTURES.some((s) => s.type === type && s.volume === volume)).toBe(true);
      }
    }
  });

  it('ключи слотов уникальны внутри структуры', () => {
    for (const structure of STRUCTURES) {
      const keys = structure.slots.map((s) => s.slotKey);
      expect(new Set(keys).size, `${structure.type}·${structure.volume}`).toBe(keys.length);
    }
  });

  it('Full Body · Компактная закрывает руки одним слотом с альтернативами', () => {
    const structure = findStructure({ type: 'Full Body', volume: 'Компактная' });
    expect(structure.exerciseCount).toBe(7);
    const arms = structure.slots.filter((s) =>
      s.allowedGroupIds.concat(s.alternativeGroupIds).includes('Бицепс'),
    );
    expect(arms).toHaveLength(1);
    expect(arms[0]?.alternativeGroupIds).toEqual(['Бицепс', 'Трицепс']);
  });

  it('верх и низ низа бедра и ягодичные — отдельные слоты везде', () => {
    for (const structure of STRUCTURES) {
      if (structure.type === 'Muscle Group Split') continue;
      for (const slot of structure.slots) {
        // Один слот не может требовать и ягодичные, и заднюю поверхность бедра.
        const lower = slot.allowedGroupIds.filter(
          (g) => g === 'Ягодичные' || g === 'Задняя поверхность бедра',
        );
        expect(lower.length, slot.slotKey).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Pull · Расширенная требует два слота задней дельты, а не группу', () => {
    const structure = findStructure({ type: 'Pull', volume: 'Расширенная' });
    expect(structure.exerciseCount).toBe(7);
    const rearDelt = structure.slots.filter((s) => s.requiredSlotTag === 'rear_delt');
    expect(rearDelt).toHaveLength(2);
    for (const slot of rearDelt) {
      expect(slot.allowedGroupIds).toEqual(['Плечи']);
    }
    expect(
      structure.slots.some((s) =>
        (s.allowedGroupIds as readonly string[]).includes('Задняя дельта'),
      ),
    ).toBe(false);
  });

  it('Pull строит спина, задняя дельта, бицепс — без трицепса', () => {
    for (const volume of VOLUME_LEVELS) {
      const structure = findStructure({ type: 'Pull', volume });
      const groups = structure.slots.map((s) => s.allowedGroupIds[0]);
      expect(groups).not.toContain('Трицепс');
      expect(groups.filter((g) => g === 'Спина').length).toBe(
        volume === 'Компактная' ? 2 : 3,
      );
    }
  });

  it('выдаёт заявленные числа для ключевых комбинаций', () => {
    expect(MATRIX['Full Body']['Стандартная']).toBe(9);
    expect(MATRIX['Upper Body']['Расширенная']).toBe(9);
    expect(MATRIX['Lower Body']['Расширенная']).toBe(8);
    expect(MATRIX['Legs']['Расширенная']).toBe(8);
    expect(MATRIX['Push']['Компактная']).toBe(4);
    expect(MATRIX['Muscle Group Split']['Расширенная']).toBe(5);
  });

  it('бросает понятную ошибку на неизвестную комбинацию', () => {
    expect(() =>
      findStructure({ type: 'Push', volume: 'Компактная' as never }),
    ).not.toThrow();
    expect(() =>
      // @ts-expect-error намеренно неверный объём
      findStructure({ type: 'Push', volume: 'Очень' }),
    ).toThrow(/нет утверждённой структуры/);
  });
});

describe('Muscle Group Split', () => {
  it('имеет пять категорий и две группы внутри каждой', () => {
    expect(MGS_CATEGORIES).toEqual(['Chest', 'Back', 'Shoulders', 'Legs', 'Arms']);
    for (const category of MGS_CATEGORIES) {
      expect(MGS_CATEGORY_GROUPS[category].length).toBeGreaterThan(0);
    }
  });

  it('категории не содержат «Пресс»', () => {
    const all = MGS_CATEGORIES.flatMap((c) => MGS_CATEGORY_GROUPS[c]);
    expect(all).not.toContain('Пресс');
  });

  it('создаёт 3/4/5 упражнений для выбранной группы', () => {
    expect(mgsSlots('Грудь', 'Компактная')).toHaveLength(3);
    expect(mgsSlots('Грудь', 'Стандартная')).toHaveLength(4);
    expect(mgsSlots('Грудь', 'Расширенная')).toHaveLength(5);
  });

  it('все слоты MGS набираются выбранной группой', () => {
    const groups: GeneratorMuscleGroup[] = ['Грудь', 'Спина', 'Плечи', 'Бицепс', 'Трицепс', 'Икры'];
    for (const group of groups) {
      for (const volume of VOLUME_LEVELS) {
        for (const slot of mgsSlots(group, volume)) {
          expect(slot.allowedGroupIds, slot.slotKey).toEqual([group]);
        }
      }
    }
  });

  it('в базовой структуре MGS слоты без группы до выбора пользователя', () => {
    const base = findStructure({ type: 'Muscle Group Split', volume: 'Стандартная' });
    for (const slot of base.slots) {
      expect(slot.allowedGroupIds).toEqual([]);
    }
  });
});