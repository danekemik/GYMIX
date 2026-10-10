# @gymix/client

Клиент Gymix на React + Vite. Работает **полностью локально**: данные лежат в
браузерной PGlite (PostgreSQL в WASM), прямой интеграции с сервером пока нет.
Домен (`@gymix/structures`, `@gymix/catalog`, `@gymix/generator`, `@gymix/db`)
переиспользуется тот же, что и на сервере.

## Структура

| Папка | Что там |
|---|---|
| `src/screens/` | Экраны приложения (тип, объём, структура, предпросмотр, выполнение, история, прогресс, настройки и т.д.) |
| `src/components/` | Переиспользуемые компоненты (кнопки, табы, сегменты, график) |
| `src/lib/` | Домен клиента: репозитории поверх PGlite, черновики, таймеры, форматирование |
| `src/hooks/` | React-хуки (`useDb`) |
| `src/styles/` | CSS по слоям: токены, глобальные стили, стили экранов и компонентов |

## Команды

```bash
pnpm --filter @gymix/client dev        # vite dev server, http://localhost:5173
pnpm --filter @gymix/client build      # tsc -b && vite build → dist/
pnpm --filter @gymix/client preview
pnpm --filter @gymix/client typecheck
```

В бандл попадает WASM-движок PGlite и данные каталога — сборка крупная
(десятки МБ в `dist/assets`), это ожидаемо для локальной БД в браузере.
