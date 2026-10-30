# @gymix/db

Схема Drizzle (PostgreSQL) и загрузка справочных данных. Одна схема и одни
миграции работают и на сервере (PostgreSQL), и в браузере (PGlite) — SQL
одинаковый для обоих окружений.

## Точки входа (`exports`)

| Импорт | Для чего |
|---|---|
| `@gymix/db` | Схема + `seed(db)` для Node (читает `reference/` с диска) |
| `@gymix/db/schema` | Только таблицы и типы строк |
| `@gymix/db/parse` | Разбор `reference/exercise_database.md` |
| `@gymix/db/seed-data` | `seedFromData(db, catalog, reference)` — чистая функция без `node:fs`, работает в браузере |
| `@gymix/db/browser` | Миграции и seed для PGlite в браузере |

Каталог и reference для клиента собираются заранее (`vite` инлайнит данные),
поэтому браузерная ветка не тянет `node:fs`.

## Миграции

Схема в `src/schema.ts`, сгенерированные миграции — в `drizzle/`. Меняете схему
— генерируете миграцию:

```bash
pnpm --filter @gymix/db migrations:generate
```

Миграции применяются сервером при старте и PGlite в тестах.

## Команды

```bash
pnpm --filter @gymix/db typecheck
pnpm --filter @gymix/db test
```

Постоянные UUID справочников: `src/reference-ids.ts`; сохраняйте идентичность при переименованиях. `migrateBrowser()` применяет версионированные SQL-миграции в браузере с журналом и откатом ошибок, без сброса пользовательских данных.
