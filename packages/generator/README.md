# @gymix/generator

Заполнение слотов структуры упражнениями каталога с учётом групп мышц,
исключений пользователя и защиты от повторов.

## Публичный API

- `generateWorkout(...)` — собранная тренировка по структуре и каталогу.
- `slotCandidates(...)` / `replacementCandidates(...)` — кандидаты для слота и
  для замены упражнения.
- `slotFor(...)`, `slotGroupUsed(...)` — сопоставление упражнения и слота.
- Ошибка `InsufficientCatalogError` и типы `GenerateOptions`,
  `GeneratedWorkout`, `GeneratedEntry`, `InsufficientSlot`.

Зависит от `@gymix/structures` (слоты) и `@gymix/catalog` (упражнения).
Правила отбора — в `reference/product_logic.md`.

## Команды

```bash
pnpm --filter @gymix/generator typecheck
pnpm --filter @gymix/generator test
```
