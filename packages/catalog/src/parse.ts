import type { MuscleGroup } from '@gymix/structures';

export interface CatalogExercise {
  /** Каноническое название, уникально в пределах каталога. */
  readonly name: string;
  /** Группы по убыванию доминирования. Первая — primary. */
  readonly muscles: readonly MuscleGroup[];
  /**
   * Вторичные мышцы. Канон запрещает помещать сюда co-primary группу,
   * поэтому здесь не может быть группы из `muscles`.
   */
  readonly secondaryMuscles: readonly MuscleGroup[];
  /** Анатомические теги. Тег `rear_delt` есть только у упражнений «Плечи». */
  readonly tags: readonly string[];
  readonly equipment: readonly string[];
  readonly patterns: readonly string[];
  /** Разделы каталога, в которых запись встречается. Обычно один. */
  readonly sections: readonly MuscleGroup[];
  /** Группа, которой запись назначена как основная. */
  readonly primary: MuscleGroup;
  /** Есть ли запись в разделе «Пресс»: такие недостижимы генератором. */
  readonly catalogOnly: boolean;
}

export interface Catalog {
  readonly exercises: readonly CatalogExercise[];
  /** Раздел «Пресс» и другие недостижимые генератором записи. */
  readonly catalogOnly: readonly CatalogExercise[];
  /** Сколько упражнений закрывает слот с тегом `rear_delt`. */
  readonly rearDeltNames: readonly string[];
}

export class CatalogParseError extends Error {}

/** «## 1. Грудь — 14» и «# 2. Спина — 20» — уровень заголовка в файле непоследователен. */
const SECTION_RE = /^#{1,3}\s*\d+\.\s*(.+?)\s*—\s*(\d+)\s*$/;
/** Число колонок в таблице каталога — строго, иначе лишняя ячейка схлопнется. */
const COLUMN_COUNT = 5;
const HEADER_RE = /^\|\s*Упражнение\s*\|/;
const DASH_RE = /^\|-{3,}\|/;
/** Правило 7 объявляет тег rear_delt перечислением упражнений в тексте. */
const REAR_DELT_RE = /`rear_delt`:\s*(.+?)\.\s/;

/** Раздел 10 — «Пресс», такие записи остаются в каталоге, но не в генерации. */
const CATALOG_ONLY_SECTION = 'Пресс';

/** Ячейки строки таблицы. `null`, если это не строка каталога. */
function splitRow(line: string): string[] | null {
  if (!line.startsWith('|')) return null;
  const body = line.replace(/^\|/, '').replace(/\|$/, '');
  const cells = body.split('|').map((c) => c.trim());
  return cells.length === COLUMN_COUNT ? cells : null;
}

function splitList(cell: string): string[] {
  const trimmed = cell.trim();
  if (trimmed === '' || trimmed === '—') return [];
  return trimmed.split(',').map((s) => s.trim()).filter((s) => s !== '' && s !== '—');
}

export function parseCatalog(source: string): Catalog {
  const lines = source.split('\n');

  const rearDelt = parseRearDeltTags(lines);

  interface Row {
    readonly name: string;
    readonly muscles: string[];
    readonly secondary: string[];
    readonly equipment: string[];
    readonly patterns: string[];
    sections: string[];
  }

  const rows = new Map<string, Row>();
  const sections: Array<{ name: string; declared: number }> = [];
  let current: string | null = null;

  for (const line of lines) {
    const section = SECTION_RE.exec(line);
    if (section?.[1] !== undefined && section[2] !== undefined) {
      current = section[1];
      sections.push({ name: current, declared: Number(section[2]) });
      continue;
    }
    if (HEADER_RE.test(line) || DASH_RE.test(line)) continue;
    if (line.trim() === '') continue;

    // Строки вне разделов (например сводные таблицы) пропускаем.
    if (current === null) continue;
    if (HEADER_RE.test(line) || DASH_RE.test(line)) continue;

    const cells = splitRow(line);
    if (cells === null) continue;
    const [name, primary, secondary, equipment, patterns] = cells;
    if (name === undefined || primary === undefined || secondary === undefined ||
        equipment === undefined || patterns === undefined) {
      throw new CatalogParseError(`не удалось разобрать строку каталога: ${line}`);
    }

    const existing = rows.get(name);
    if (existing) {
      // Правило 2: одна запись может встречаться в двух разделах, при этом
      // Primary и Secondary обязаны совпадать побайтово.
      const sameMuscles = JSON.stringify(existing.muscles) === JSON.stringify(splitList(primary));
      const sameSecondary = JSON.stringify(existing.secondary) === JSON.stringify(splitList(secondary));
      const samePatterns = JSON.stringify(existing.patterns) === JSON.stringify(splitList(patterns));
      if (!sameMuscles || !sameSecondary || !samePatterns) {
        throw new CatalogParseError(
          `раздел «${current}» расходится с каноном для «${name}»: ` +
            `primary ${JSON.stringify(existing.muscles)} vs ${JSON.stringify(splitList(primary))}, ` +
            `secondary ${JSON.stringify(existing.secondary)} vs ${JSON.stringify(splitList(secondary))}, ` +
            `patterns ${JSON.stringify(existing.patterns)} vs ${JSON.stringify(splitList(patterns))}`,
        );
      }
      existing.sections.push(current);
    } else {
      rows.set(name, {
        name,
        muscles: splitList(primary),
        secondary: splitList(secondary),
        equipment: splitList(equipment),
        patterns: splitList(patterns),
        sections: [current],
      });
    }
  }

  if (rows.size === 0) {
    throw new CatalogParseError('в каталоге не найдено ни одной строки упражнения');
  }

  const exercises: CatalogExercise[] = [];
  for (const row of rows.values()) {
    const [primary, ...rest] = row.muscles;
    if (primary === undefined) {
      throw new CatalogParseError(`у «${row.name}» пустой Primary`);
    }
    const sections = [...new Set(row.sections)];
    // Правило 2 каталога: Secondary не содержит co-primary группу.
    const leaked = row.secondary.filter((m) => row.muscles.includes(m));
    if (leaked.length > 0) {
      throw new CatalogParseError(
        `у «${row.name}» Secondary содержит primary-группу: ${leaked.join(', ')}`,
      );
    }

    // Правило 5 каталога: пустой паттерн — дефект данных, а не «нет данных».
    if (row.patterns.length === 0) {
      throw new CatalogParseError(
        `у «${row.name}» пустой паттерн: движение без классификации недопустимо`,
      );
    }
    exercises.push({
      name: row.name,
      primary: primary as MuscleGroup,
      muscles: row.muscles as readonly MuscleGroup[],
      secondaryMuscles: row.secondary as readonly MuscleGroup[],
      tags: rearDelt.has(row.name) ? ['rear_delt'] : [],
      equipment: row.equipment,
      patterns: row.patterns,
      sections: sections as readonly MuscleGroup[],
      catalogOnly: sections.includes(CATALOG_ONLY_SECTION),
    });
    // rest нужен только для порядка доминирования, который уже сохранён в muscles.
    void rest;
  }

  const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  for (const section of sections) {
    const actual = sorted.filter((e) => e.sections.includes(section.name as MuscleGroup)).length;
    if (actual !== section.declared) {
      throw new CatalogParseError(
        `раздел «${section.name}» объявляет ${section.declared}, фактически ${actual}`,
      );
    }
  }

  return {
    exercises: sorted,
    catalogOnly: sorted.filter((e) => e.catalogOnly),
    rearDeltNames: sorted.filter((e) => e.tags.includes('rear_delt')).map((e) => e.name),
  };
}

/**
 * Тег `rear_delt` не вынесен в колонку таблицы, а объявлен в правиле 7.
 * Читаем оттуда, чтобы правка документа не расходилась с кодом.
 */
function parseRearDeltTags(lines: readonly string[]): Set<string> {
  const text = lines.join('\n');
  const match = REAR_DELT_RE.exec(text);
  if (!match?.[1]) {
    throw new CatalogParseError('не найдено правило 7 с перечислением rear_delt');
  }
  return new Set(
    match[1]
      .split(',')
      .map((s) => s.trim().replace(/^`|`$/g, ''))
      .filter((s) => s !== ''),
  );
}

/** Упражнение подходит слоту: группа входит в основные или альтернативы, тег учтён. */
export function matchesSlot(
  exercise: CatalogExercise,
  allowed: readonly string[],
  requiredTag?: string,
): boolean {
  if (exercise.catalogOnly) return false;
  if (!allowed.some((g) => exercise.muscles.includes(g as MuscleGroup))) return false;
  if (requiredTag === undefined) return true;
  return exercise.tags.includes(requiredTag);
}