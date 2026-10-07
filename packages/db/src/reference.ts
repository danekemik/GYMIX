import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Референсные справочники читаются из `reference/exercise_database.md`,
 * который каноничен для перечней оборудования и паттернов. Дублировать
 * 50 типов оборудования и 23 паттерна в коде не нужно.
 */
const REFERENCE_PATH = fileURLToPath(
  new URL('../../../reference/exercise_database.md', import.meta.url),
);

export interface Reference {
  /** 50 функциональных типов оборудования в порядке канона. */
  readonly equipment: readonly string[];
  /** 21 строка таблицы алиасов: лейбл каталога → канонические типы. */
  readonly equipmentAliases: ReadonlyMap<string, readonly string[]>;
  /** 23 утверждённых паттерна движения. */
  readonly movementPatterns: readonly string[];
}

const EQUIPMENT_SECTION = '## Перечень тренажёров и оборудования';
const EQUIPMENT_END = '### Справочники нормализации';
const ALIAS_SECTION = '### Таблица алиасов оборудования (полная)';
const ALIAS_END = '**Решения по неоднозначным случаям';
const PATTERNS_SECTION = '### Movement patterns V1';
const PATTERNS_END = 'В присланном перечне';

/** Ячейка таблицы алиасов без внешних вертикальных черт. */
function tableCells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
}

let cached: Reference | undefined;

export function loadReference(): Reference {
  if (cached === undefined) {
    cached = parseReference(readFileSync(REFERENCE_PATH, 'utf8'));
  }
  return cached;
}

export function parseReference(source: string): Reference {
  const lines = source.split('\n');

  const equipment = section(lines, EQUIPMENT_SECTION, EQUIPMENT_END)
    .map((l) => /^- (.+)$/.exec(l)?.[1])
    .filter((v): v is string => v !== undefined);

  const movementPatterns = section(lines, PATTERNS_SECTION, PATTERNS_END)
    .map((l) => /^\d+\.\s+`([^`]+)`/.exec(l)?.[1])
    .filter((v): v is string => v !== undefined);

  const equipmentAliases = new Map<string, readonly string[]>();
  for (const line of section(lines, ALIAS_SECTION, ALIAS_END)) {
    if (!line.startsWith('|')) continue;
    const cells = tableCells(line);
    const [labelCell, targetCell] = cells;
    if (labelCell === undefined || targetCell === undefined) continue;
    if (labelCell.startsWith('Лейбл') || /^-+$/.test(labelCell.replace(/`/g, ''))) continue;
    const label = backticked(labelCell)[0];
    if (label === undefined) continue;
    // «не тип оборудования: пустое оборудование» — пустое оборудование.
    equipmentAliases.set(label, backticked(targetCell));
  }

  if (equipment.length !== 50) {
    throw new ReferenceParseError(`ожидалось 50 типов оборудования, найдено ${equipment.length}`);
  }
  if (movementPatterns.length !== 23) {
    throw new ReferenceParseError(`ожидалось 23 паттерна, найдено ${movementPatterns.length}`);
  }
  if (equipmentAliases.size !== 21) {
    throw new ReferenceParseError(`ожидалось 21 алиас, найдено ${equipmentAliases.size}`);
  }
  const unknown = [...equipmentAliases.values()].flat().filter((t) => !equipment.includes(t));
  if (unknown.length > 0) {
    throw new ReferenceParseError(`алиасы ссылаются на неизвестный тип: ${unknown.join(', ')}`);
  }
  return { equipment, equipmentAliases, movementPatterns };
}

/**
 * Разрешение лейбла каталога в канонические типы. Лейбл, которого нет
 * в таблице алиасов, обязан совпадать с каноническим типом; иначе это
 * неразрешимое вхождение, которое нужно согласовать, а не прятать.
 */
export function resolveEquipmentLabel(reference: Reference, label: string): readonly string[] {
  const aliased = reference.equipmentAliases.get(label);
  if (aliased !== undefined) return aliased;
  if (reference.equipment.includes(label)) return [label];
  throw new ReferenceParseError(`лейбл каталога не разрешается в оборудование: ${label}`);
}

export class ReferenceParseError extends Error {}

function section(lines: readonly string[], start: string, end: string): string[] {
  const from = lines.findIndex((l) => l.startsWith(start));
  if (from < 0) throw new ReferenceParseError(`не найден раздел «${start}»`);
  const to = lines.findIndex((l, i) => i > from && l.startsWith(end));
  if (to < 0) throw new ReferenceParseError(`не найден конец раздела «${start}»`);
  return lines.slice(from + 1, to);
}
