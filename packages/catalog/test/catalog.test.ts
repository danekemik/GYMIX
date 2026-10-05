import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS, MUSCLE_GROUPS as GROUPS } from '@gymix/structures';
import { loadCatalog, parseCatalog } from '@gymix/catalog';
import {
  CatalogParseError,
  matchesSlot,
} from '@gymix/catalog';

/**
 * Каталог читается лениво внутри каждого теста: если парсер падает на
 * мутированном документе, падает конкретный тест, а не весь набор.
 */
let cached: ReturnType<typeof loadCatalog> | undefined;
function catalog(): ReturnType<typeof loadCatalog> {
  if (cached === undefined) cached = loadCatalog();
  return cached;
}

describe('каталог как исполняемые данные', () => {
  it('парсится из документа без ручных правок', () => {
    expect(catalog().exercises.length).toBe(113);
  });

  it('имеет 118 размещений по группам', () => {
    const placements = catalog().exercises.reduce((n, e) => n + e.sections.length, 0);
    expect(placements).toBe(118);
  });

  it('держит ровно пять межгрупповых дублей', () => {
    const crossGroup = catalog().exercises.filter((e) => e.sections.length > 1);
    expect(crossGroup.map((e) => e.name).sort()).toEqual([
      'Step-up',
      'Болгарские приседания',
      'Выпады назад',
      'Отжимания на брусьях',
      'Румынская тяга со штангой',
    ]);
  });

  it('помечает записи «Пресс» недостижимыми для генератора, а не прячет их', () => {
    // Записи «Пресс» остаются в каталоге со своей primary-группой —
    // они доступны в поиске и на экране замены.
    expect(catalog().exercises.filter((e) => e.primary === 'Пресс')).toHaveLength(11);
    expect(catalog().exercises.filter((e) => e.catalogOnly).map((e) => e.primary)).toEqual(
      Array(11).fill('Пресс'),
    );
  });

  it('помечает 11 записей «Пресс» как только каталог', () => {
    expect(catalog().catalogOnly).toHaveLength(11);
    expect(catalog().catalogOnly.every((e) => e.sections.includes('Пресс'))).toBe(true);
  });

  it('никогда не отдаёт «Пресс» в генерацию', () => {
    const press = catalog().exercises.filter((e) => e.sections.includes('Пресс'));
    for (const exercise of press) {
      for (const group of GROUPS) {
        expect(matchesSlot(exercise, [group])).toBe(false);
      }
      expect(matchesSlot(exercise, ['Пресс'])).toBe(false);
    }
  });

  it('читает тег rear_delt из правила 7: ровно три упражнения', () => {
    expect([...catalog().rearDeltNames].sort()).toEqual([
      'Face Pull',
      'Обратная бабочка',
      'Разведение гантелей в наклоне',
    ]);
  });

  it('назначает rear_delt только упражнениям группы «Плечи»', () => {
    const tagged = catalog().exercises.filter((e) => e.tags.length > 0);
    expect(tagged.every((e) => e.primary === 'Плечи')).toBe(true);
  });

  it('содержит только десять утверждённых групп', () => {
    const seen = new Set(catalog().exercises.flatMap((e) => e.muscles));
    expect([...seen].sort()).toEqual([...GROUPS].sort());
    expect(seen.has('Ягодицы' as never)).toBe(false);
  });

  it('не оставляет записей без паттерна', () => {
    const empty = catalog().exercises.filter((e) => e.patterns.length === 0);
    expect(empty.map((e) => e.name)).toEqual([]);
  });

  it('записи «Пресс» не подменяют другие группы через secondary', () => {
    // Правило каталога: Secondary не должен вытягивать запись «Пресс»
    // в слоты других групп. Мутация «Планка → Трицепс» обязана падать.
    const pressWithForeignSecondary = catalog().catalogOnly.filter(
      (e) =>
        e.muscles.some((m) => m !== 'Пресс') ||
        e.secondaryMuscles.some((m) => m !== 'Пресс'),
    );
    expect(pressWithForeignSecondary.map((e) => e.name)).toEqual([]);
  });

  it('пустой паттерн в документе считается дефектом, а не «без паттерна»', () => {
    // Пустая ячейка `| |` должна падать так же, как отсутствие паттерна.
    const broken = [
      '## 1. Грудь — 1',
      '',
      '| Упражнение | Primary | Secondary | Оборудование | Паттерн |',
      '|---|---|---|---|---|',
      '| Жим лёжа | Грудь | Трицепс | Штанга | |',
      '',
      'Правило 7: тег `rear_delt`: `Face Pull`. Закрывает слот.',
      '',
    ].join('\n');
    expect(() => parseCatalog(broken)).toThrow(/пустой паттерн/);
  });
});

describe('парсер защищён от типовых дефектов каталога', () => {
  const base = (): string =>
    [
      '## 1. Грудь — 2',
      '',
      '| Упражнение | Primary | Secondary | Оборудование | Паттерн |',
      '|---|---|---|---|---|',
      '| Жим лёжа | Грудь | Трицепс | Штанга | Horizontal Push |',
      '| Сведение | Грудь | Плечи | Блок | Horizontal Shoulder Movement |',
      '',
      '## 2. Пресс — 1',
      '',
      '| Упражнение | Primary | Secondary | Оборудование | Паттерн |',
      '|---|---|---|---|---|',
      '| Планка | Пресс | — | — | Anti-Extension |',
      '',
      'Правило: слот «задняя дельта» (Pull) — тег, не группа. Он закрывается `rear_delt`: `Face Pull`. Их ровно один.',
      '',
    ].join('\n');

  it('принимает корректный документ', () => {
    const parsed = parseCatalog(base());
    expect(parsed.exercises).toHaveLength(3);
    // Тег есть в документе, но «Face Pull» нет среди строк таблицы.
    expect(parsed.rearDeltNames).toEqual([]);
  });

  it('падает, если число в заголовке раздела не совпадает с фактом', () => {
    const wrong = base().replace('## 1. Грудь — 2', '## 1. Грудь — 5');
    expect(() => parseCatalog(wrong)).toThrow(/объявляет 5, фактически 2/);
  });

  it('падает, если у записи расходятся паттерны между разделами', () => {
    const bad = [
      '## 1. Грудь — 1',
      '',
      '| Упражнение | Primary | Secondary | Оборудование | Паттерн |',
      '|---|---|---|---|---|',
      '| Отжимания на брусьях | Грудь | Трицепс | Брусья | Horizontal Push |',
      '',
      '## 2. Трицепс — 1',
      '',
      '| Упражнение | Primary | Secondary | Оборудование | Паттерн |',
      '|---|---|---|---|---|',
      '| Отжимания на брусьях | Трицепс | Грудь | Брусья | Elbow Extension |',
      '',
      'Правило 7: тег `rear_delt`: `Face Pull`. Закрывает.',
      '',
    ].join('\n');
    expect(() => parseCatalog(bad)).toThrow(/расходится с каноном/);
  });

  it('падает, если пропало правило про rear_delt', () => {
    const noRule = base().replace(/Правило.*\n/, '');
    expect(() => parseCatalog(noRule)).toThrow(CatalogParseError);
  });

  it('считает «—» пустым списком, а не группой', () => {
    const parsed = parseCatalog(base());
    const plank = parsed.exercises.find((e) => e.name === 'Планка');
    expect(plank?.equipment).toEqual([]);
    expect(plank?.muscles).toEqual(['Пресс']);
  });

  it('не считает мусорные строки упражнениями', () => {
    // Шесть колонок вместо пяти: строка не соответствует формату каталога.
    const parsed = parseCatalog(
      base() + '\n| Мусор | а | б | в | г | д |\n',
    );
    expect(parsed.exercises).toHaveLength(3);
  });

  it('назначает rear_delt только тем строкам, которые есть в каталоге', () => {
    const parsed = parseCatalog(
      base().replace('| Планка | Пресс', '| Face Pull | Плечи').replace(
        '| Пресс | — | — | Anti-Extension |',
        '| Плечи | Спина | Верхний блок | Horizontal Shoulder Movement |',
      ),
    );
    expect(parsed.rearDeltNames).toEqual(['Face Pull']);
    expect(parsed.exercises.find((e) => e.name === 'Face Pull')?.primary).toBe('Плечи');
  });
});

describe('все группы и теги покрыты каталогом', () => {
  it('на каждую группу без «Пресс» есть хотя бы одно упражнение', () => {
    for (const group of MUSCLE_GROUPS) {
      if (group === 'Пресс') continue;
      const hits = catalog().exercises.filter((e) => e.muscles.includes(group));
      expect(hits.length, `группа ${group}`).toBeGreaterThan(0);
    }
  });
});