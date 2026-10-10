# @gymix/catalog

Читает канонический каталог упражнений из
`reference/exercise_catalog_v1.md` в типизированные данные. Документ —
единственный источник истины для перечня упражнений: в коде 113 записей не
дублируются, они парсятся на старте.

## Публичный API

- `loadCatalog()` — каталог из канонического файла (с кэшем на процесс).
- `parseCatalogFile(path)` / `parseCatalog(source)` — разбор произвольного
  источника.
- `matchesSlot(exercise, slot)` — подходит ли упражнение слоту структуры.
- Типы `Catalog`, `CatalogExercise`; ошибка `CatalogParseError`.

Каталог — это данные. Не редактируйте разбор под частный случай: если
документ расходится с кодом, падает `scripts/verify_sync.py` и тесты пакета.

## Команды

```bash
pnpm --filter @gymix/catalog typecheck
pnpm --filter @gymix/catalog test
```
