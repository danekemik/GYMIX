#!/usr/bin/env python3
"""Сверка канона: Markdown против DOCX.

Канон проекта — оба DOCX. Markdown-файлы в reference/ считаются заметками
и должны повторять ключевые числа и решения DOCX, но не обязаны быть
полным отражением спецификации: в DOCX есть разделы, которых нет в MD.

Скрипт ничего не исправляет. Он падает с кодом 1, если утверждение
присутствует в одном файле и отсутствует в другом.

Запуск:
    python3 scripts/verify_sync.py
"""

from __future__ import annotations

import collections
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "reference"

PL = REF / "product_logic.md"
ED = REF / "exercise_database.md"
EC = REF / "exercise_catalog_v1.md"
SPEC = REF / "Спецификация_трекер_для_спортзала_V1.docx"
UIUX = REF / "UI_UX_спецификация_трекер_для_спортзала.docx"

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.passed = 0

    def check(self, ok: bool, label: str, detail: str = "") -> bool:
        if ok:
            self.passed += 1
        else:
            where = f" — {detail}" if detail else ""
            self.failures.append(f"{label}{where}")
        return ok

    def section(self, title: str) -> None:
        print(f"\n{title}")


def docx_paragraphs(path: Path) -> list[str]:
    """Текст всех абзацев документа по порядку."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    out: list[str] = []
    for p in root.iter(f"{W_NS}p"):
        text = "".join(t.text or "" for t in p.iter(f"{W_NS}t"))
        out.append(text)
    return out


def docx_is_valid(path: Path) -> tuple[bool, str]:
    with zipfile.ZipFile(path) as z:
        broken = z.testzip()
        if broken:
            return False, f"повреждён элемент {broken}"
        for name in z.namelist():
            if name.endswith((".xml", ".rels")):
                try:
                    ET.fromstring(z.read(name))
                except ET.ParseError as exc:
                    return False, f"{name}: {exc}"
    return True, ""


def load() -> dict[str, str]:
    return {
        "product_logic.md": PL.read_text(encoding="utf-8"),
        "exercise_database.md": ED.read_text(encoding="utf-8"),
        "exercise_catalog_v1.md": EC.read_text(encoding="utf-8"),
        "Спецификация_трекер_для_спортзала_V1.docx": "\n".join(docx_paragraphs(SPEC)),
        "UI_UX_спецификация_трекер_для_спортзала.docx": "\n".join(docx_paragraphs(UIUX)),
    }


# Утверждение, которое обязано звучать одинаково во всех перечисленных файлах.
# Формат: (подпись, где искать, шаблон)
CLAIMS: list[tuple[str, tuple[str, ...], str]] = [
    ("матрица Full Body 7/9/10",
     ("exercise_database.md", "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"7\s*/\s*9\s*/\s*10"),
    ("матрица Upper Body 6/7/9",
     ("exercise_database.md", "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"6\s*/\s*7\s*/\s*9"),
    ("матрица Lower Body 5/6/8",
     ("exercise_database.md", "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"5\s*/\s*6\s*/\s*8"),
    ("матрица Push и Pull 4/6/7",
     ("exercise_database.md", "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"4\s*/\s*6\s*/\s*7"),
    ("матрица Muscle Group Split 3/4/5",
     ("product_logic.md", "exercise_database.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"3\s*/\s*4\s*/\s*5"),
    ("вход по email и паролю",
     ("product_logic.md", "exercise_database.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"email\s*(?:и\s*парол|,\s*парол|\+\s*парол|и парол)"),
    ("пароль от 8 символов",
     ("product_logic.md", "exercise_database.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"8\s*символ"),
    ("активная тренировка принадлежит устройству",
     ("product_logic.md", "exercise_database.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"устройств"),
    ("точка графика — лучший подход",
     ("product_logic.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"лучш\w*\s+подход"),
    ("завершение при 0 упражнениях не засчитывается",
     ("product_logic.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"(?:0|нул\w*|ни\s+одн\w*)\s+выполненных\s+упражнени"),
    ("исключение в шаблоне помечается",
     ("product_logic.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"исключено вами"),
    ("coverage-проверка обязательна",
     ("product_logic.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"coverage"),
    ("график в кг за 6 месяцев",
     ("product_logic.md",
      "Спецификация_трекер_для_спортзала_V1.docx",
      "UI_UX_спецификация_трекер_для_спортзала.docx"),
     r"6\s*месяц"),
    ("срок жизни незавершённой сессии 30 дней",
     ("product_logic.md", "exercise_database.md",
      "Спецификация_трекер_для_спортзала_V1.docx"),
     r"30\s*дн"),
    ("каноническое имя группы «Ягодичные»",
     ("product_logic.md", "exercise_database.md", "exercise_catalog_v1.md",
      "Спецификация_трекер_для_спортзала_V1.docx"),
     r"Ягодичн"),
    ("счётчик размещений 118",
     ("exercise_catalog_v1.md", "Спецификация_трекер_для_спортзала_V1.docx"),
     r"\b118\b"),
    ("счётчик уникальных 113",
     ("exercise_catalog_v1.md", "Спецификация_трекер_для_спортзала_V1.docx"),
     r"\b113\b"),
    ("группа «Пресс» не попадает в генерацию",
     ("product_logic.md", "exercise_database.md", "exercise_catalog_v1.md",
      "Спецификация_трекер_для_спортзала_V1.docx"),
     r"Пресс"),
    ("внутренние involvement и confidence",
     ("product_logic.md", "exercise_database.md",
      "Спецификация_трекер_для_спортзала_V1.docx"),
     r"involvement"),
    ("паттерн Horizontal Shoulder Movement",
     ("exercise_database.md", "exercise_catalog_v1.md",
      "Спецификация_трекер_для_спортзала_V1.docx"),
     r"Horizontal Shoulder Movement"),
]

# Утверждения, которых не должно быть ни в одном файле.
# Третий элемент — контекст, который считается легитимным упоминанием.
# Например, «вариант „Ягодицы“ не применяется» — это документация нормализации,
# а не возврат старого имени. Предложения с таким контекстом отбрасываются
# до проверки.
FORBIDDEN: list[tuple[str, str, str]] = [
    ("диапазоны объёмов не вернулись",
     r"(?:5[–-]6|8[–-]9|7[–-]8)",
     r"больше не использу|упраздн|не использу|диапазон\w* не\b"),
    ("имя «Ягодицы» не вернулось",
     r"\bЯгодицы\b",
     r"вариант|нормализ|не применя|использовал|замен"),
    ("символ замены",
     r"\ufffd",
     r"$^"),
    ("разметка ~~ не разобрана",
     r"~~",
     r"$^"),
    ("инвертированное имя паттерна",
     r"Shoulder Horizontal Movement",
     r"$^"),
]

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])(?:\*+)?\s+")
EXEMPT_WINDOW = 70

# Формулировки, которыми в файлах помечается недостижимость «Пресса».
UNREACHABLE = (r"не\s+попада|недостижим|недоступн|только\s+(?:в\s+)?каталог|"
               r"не\s+содержит|не\s+в\s+генерац|каталог\w*\s+только|"
               r"не\s+включён|не\s+входит|не\s+используется\s+генератор")


def violating_contexts(text: str, pattern: str, exempt: str) -> list[str]:
    """Фрагменты, где запрещённое слово встречается как живое упоминание.

    Упоминание считается легитимным, если контекст-оправдание найден рядом с
    самим словом, а не где-то в соседней фразе. Так «вариант «Ягодицы» не
    применяется» проходит, а «группа в таблице: Ягодицы» — нет, даже если
    в том же абзаце где-то есть слово «вариант».
    """
    out: list[str] = []
    for m in re.finditer(pattern, text, re.I):
        if exempt != r"$^":
            lo = max(0, m.start() - EXEMPT_WINDOW)
            hi = min(len(text), m.end() + EXEMPT_WINDOW)
            if re.search(exempt, text[lo:hi], re.I):
                continue
        lo = max(0, m.start() - 45)
        hi = min(len(text), m.end() + 45)
        out.append(re.sub(r"\s+", " ", text[lo:hi]).strip())
    return out


def parse_catalog(text: str) -> tuple[list[list[str]], dict[str, int], dict[str, int]]:
    """Строки каталога, заявленные счётчики групп и фактические."""
    rows: list[list[str]] = []
    declared: dict[str, int] = {}
    actual: collections.Counter[str] = collections.Counter()
    group: str | None = None
    for line in text.splitlines():
        heading = re.match(r"^#{1,2}\s+\d+\.\s+(.+?)\s+—\s+(\d+)\s*$", line)
        if heading:
            group = heading.group(1).strip()
            declared[group] = int(heading.group(2))
            continue
        if not line.startswith("|") or line.count("|") < 6:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0] == "Упражнение" or set(cells[0]) <= set("-"):
            continue
        rows.append(cells)
        if group:
            actual[group] += 1
    return rows, declared, dict(actual)


def verify(rep: Report, docs: dict[str, str]) -> None:
    rep.section("Файлы на месте")
    for path in (PL, ED, EC, SPEC, UIUX):
        rep.check(path.exists(), f"отсутствует {path.relative_to(ROOT)}")
    if rep.failures:
        return

    rep.section("Файлы читаются")
    for path in (PL, ED, EC):
        try:
            path.read_text(encoding="utf-8")
            rep.check(True, "")
        except (OSError, UnicodeDecodeError) as exc:
            rep.check(False, f"{path.name} не читается", str(exc))
    for path in (SPEC, UIUX):
        try:
            with zipfile.ZipFile(path) as z:
                z.read("word/document.xml")
            rep.check(True, "")
        except (OSError, zipfile.BadZipFile, KeyError) as exc:
            rep.check(False, f"{path.name} не открывается как DOCX", str(exc))
    if rep.failures:
        return

    rep.section("Целостность DOCX")
    for path in (SPEC, UIUX):
        ok, why = docx_is_valid(path)
        rep.check(ok, f"повреждён {path.name}", why)

    rep.section("Канон: утверждения звучат одинаково")
    for label, files, pattern in CLAIMS:
        missing = [f for f in files if not re.search(pattern, docs[f], re.I)]
        rep.check(not missing, f"«{label}» отсутствует", ", ".join(missing))

    rep.section("Канон: запрещённые формулировки не вернулись")
    for label, pattern, exempt in FORBIDDEN:
        for f, d in docs.items():
            bad = violating_contexts(d, pattern, exempt)
            rep.check(not bad, f"«{label}» снова в {f}",
                      f"…{bad[0]}…" if bad else "")

    rep.section("Каталог: внутренняя арифметика")
    rows, declared, actual = parse_catalog(docs["exercise_catalog_v1.md"])
    rep.check(len(rows) == 118, f"размещений {len(rows)}, ожидалось 118")
    unique = len({r[0] for r in rows})
    rep.check(unique == 113, f"уникальных {unique}, ожидалось 113")
    mismatched = {g: (declared[g], actual.get(g, 0)) for g in declared
                  if declared[g] != actual.get(g, 0)}
    rep.check(not mismatched, "счётчики групп не сходятся", str(mismatched))

    dupes = {n: c for n, c in collections.Counter(r[0] for r in rows).items() if c > 1}
    rep.check(len(dupes) == 5, f"межгрупповых дублей {len(dupes)}, ожидалось 5",
              ", ".join(sorted(dupes)))

    declared_press = declared.get("Пресс")
    rep.check(declared_press == 11, f"в группе «Пресс» {declared_press} записей, ожидалось 11")

    rep.section("Каталог: поля строк не пустые")
    for i, row in enumerate(rows, 1):
        rep.check(all(row), f"строка {i} содержит пустое поле", row[0] if row else "")

    rep.section("Группа «Пресс» недостижима для генерации")
    for path in (PL, ED, SPEC):
        sentences = [s for s in SENTENCE_SPLIT.split(docs[path.name])
                     if re.search(r"Пресс", s)]
        rep.check(bool(sentences), f"{path.name}: «Пресс» вообще не упомянут")
        rep.check(any(re.search(UNREACHABLE, s, re.I) for s in sentences),
                  f"{path.name}: «Пресс» упомянут, но нигде не помечен как "
                  f"недостижимый для генерации")
    rep.check(re.search(UNREACHABLE, docs["exercise_catalog_v1.md"], re.I) is not None,
              "exercise_catalog_v1.md: «Пресс» не помечен как только каталог")


MATRIX_CLAIM = re.compile(
    r"Full Body 7/9/10, Upper Body 6/7/9, Lower Body 5/6/8, "
    r"Push 4/6/7, Pull 4/6/7, Legs 5/6/8, Muscle Group Split 3/4/5"
)

MATRIX_FILES = (
    "exercise_database.md",
    "Спецификация_трекер_для_спортзала_V1.docx",
)

#: Числа, закодированные в packages/structures/src/matrix.ts.
CODE_MATRIX: dict[tuple[str, str], int] = {
    ("Full Body", "Компактная"): 7,
    ("Full Body", "Стандартная"): 9,
    ("Full Body", "Расширенная"): 10,
    ("Upper Body", "Компактная"): 6,
    ("Upper Body", "Стандартная"): 7,
    ("Upper Body", "Расширенная"): 9,
    ("Lower Body", "Компактная"): 5,
    ("Lower Body", "Стандартная"): 6,
    ("Lower Body", "Расширенная"): 8,
    ("Push", "Компактная"): 4,
    ("Push", "Стандартная"): 6,
    ("Push", "Расширенная"): 7,
    ("Pull", "Компактная"): 4,
    ("Pull", "Стандартная"): 6,
    ("Pull", "Расширенная"): 7,
    ("Legs", "Компактная"): 5,
    ("Legs", "Стандартная"): 6,
    ("Legs", "Расширенная"): 8,
    ("Muscle Group Split", "Компактная"): 3,
    ("Muscle Group Split", "Стандартная"): 4,
    ("Muscle Group Split", "Расширенная"): 5,
}

TYPES_ORDER = (
    "Full Body", "Upper Body", "Lower Body",
    "Push", "Pull", "Legs", "Muscle Group Split",
)
VOLUMES_ORDER = ("Компактная", "Стандартная", "Расширенная")

MATRIX_SOURCE = "packages/structures/src/matrix.ts"


def check_matrix_in_code() -> list[str]:
    """Кодовая матрица должна совпадать и с каноном, и с MATRIX_CLAIM."""
    path = ROOT / MATRIX_SOURCE
    if not path.exists():
        return []
    source = path.read_text(encoding="utf-8")
    problems: list[str] = []

    match = re.search(r"export const MATRIX[^=]*=\s*\{(.*?)\n\};", source, re.S)
    if not match:
        return [f"{MATRIX_SOURCE}: не найден объект MATRIX"]

    block = match.group(1)
    for workout_type in TYPES_ORDER:
        type_match = re.search(
            rf"'{re.escape(workout_type)}':\s*\{{([^}}]*)\}}", block
        )
        if not type_match:
            problems.append(f"{MATRIX_SOURCE}: нет строки {workout_type!r}")
            continue
        numbers = re.findall(r"(\d+)", type_match.group(1))
        expected = [str(CODE_MATRIX[(workout_type, v)]) for v in VOLUMES_ORDER]
        if numbers != expected:
            problems.append(
                f"{MATRIX_SOURCE}: {workout_type} = {numbers}, ожидалось {expected}"
            )

    # Объекты в коде, которых нет в утверждённых типах, — лишние строки.
    # Проверяем явно, иначе `Core: { Компактная: 1 }` проходит молча.
    known = set(TYPES_ORDER)
    for found in re.findall(r"'([^']+)':\s*\{[^}]*\d", block):
        if found not in known:
            problems.append(f"{MATRIX_SOURCE}: лишний тип {found!r} в MATRIX")

    if len(CODE_MATRIX) != 21:
        problems.append(
            f"{MATRIX_SOURCE}: в таблице {len(CODE_MATRIX)} комбинаций, а должно быть 21"
        )
    return problems


def main() -> int:
    rep = Report()
    try:
        docs = load()
    except (OSError, zipfile.BadZipFile) as exc:
        print(f"не удалось прочитать файлы: {exc}", file=sys.stderr)
        return 2

    verify(rep, docs)

    code_problems = check_matrix_in_code()
    for problem in code_problems:
        rep.check(False, "матрица в коде расходится с каноном", problem)
    rep.check(
        not code_problems,
        f"матрица объёмов в {MATRIX_SOURCE} совпадает с каноном",
    )

    matrix_docs = [
        name for name, text in docs.items()
        if name in MATRIX_FILES and MATRIX_CLAIM.search(text)
    ]
    rep.check(
        bool(matrix_docs),
        "каноническая формулировка матрицы не найдена",
        f"ни в одном из {len(MATRIX_FILES)} файлов",
    )

    print()
    if rep.failures:
        print(f"РАСХОЖДЕНИЙ: {len(rep.failures)}  (проверок пройдено: {rep.passed})")
        for f in rep.failures:
            print(f"  • {f}")
        print("\nКанон — DOCX. Правь формулировку в DOCX и в заметке рядом с ним.")
        return 1

    print(f"все проверки пройдены: {rep.passed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
