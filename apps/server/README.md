# @gymix/server

Бэкенд Gymix: аккаунты (email + пароль, подтверждение кодом), устройства и
сессии, синхронизация активной тренировки, шаблоны, исключения, вес тела,
прогресс, выгрузка и удаление аккаунта. Данные — PostgreSQL, доступ к БД
через Drizzle (одна схема с клиентом).

## Быстрый старт

```bash
pnpm install
pnpm --filter @gymix/server dev        # tsx watch, http://localhost:3000
```

Локальная PostgreSQL: `pnpm db:up` из корня, порт 55432. Подготовка схемы: `pnpm db:prepare`.

Для разработки достаточно локального PostgreSQL: скопируйте
`apps/server/.env.example` в `apps/server/.env` и задайте `DATABASE_URL`. Миграции и посев
референсных справочников выполняются на старте (`APP_MIGRATE`, `APP_SEED`),
если заданы `MIGRATIONS_DIR` и `REFERENCE_DIR`. В режиме `EMAIL_MODE=console`
коды подтверждения печатаются в лог.

## Команды

```bash
pnpm --filter @gymix/server typecheck   # tsc, включая тесты
pnpm --filter @gymix/server test        # vitest на PGlite (без внешней БД)
pnpm --filter @gymix/server build       # tsup → dist/index.js (один ESM-бандл)
pnpm --filter @gymix/server start       # node dist/index.js (после build)
```

Тесты поднимают настоящее приложение через HTTP-слой Hono и настоящую схему
на встроенном PGlite — внешний PostgreSQL для них не нужен.

## Структура

| Путь | Назначение |
|---|---|
| `src/env.ts` | Схема окружения (zod) → `AppConfig` |
| `src/index.ts` | Запуск: конфиг, БД, приложение, планировщик, graceful shutdown |
| `src/app.ts` | Сборка Hono: CORS, security-заголовки, роуты, обработка ошибок |
| `src/db.ts` | Пул `pg`, миграции, посев под advisory-lock, `pingDb` |
| `src/auth/` | Логика аккаунта и токенов, `src/routes/auth.ts` |
| `src/sync/ops.ts` | Движок идемпотентных операций тренировки |
| `src/sync/snapshot.ts` | Снимок тренировки для клиента |
| `src/routes/` | REST-роуты (workouts, templates, exclusions, …) |
| `src/jobs.ts` | Фоновая очистка сессий, кодов, stale-тренировок и удалённых аккаунтов |

## API

Все прикладные маршруты — под `/api/v1`, здоровье — `/healthz`.
Аутентификация: `Authorization: Bearer <accessToken>`. Ошибки в едином виде
`{ error: { code, message } }`.

- **Аккаунт** — `POST /auth/register`, `/auth/verify-email`, `/auth/resend-code`,
  `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`,
  `/auth/password/reset`, `/auth/password/reset/confirm`, `/auth/password/change`,
  `GET/DELETE /auth/devices[/:id]`
- **Профиль** — `GET /account`, `GET /account/export`, `DELETE /account`
  (мягкое удаление, grace-период 7 дней)
- **Тренировки** — `POST /workouts`, `GET /workouts/active`, `GET/DELETE/PATCH
  /workouts/:id`, `POST /workouts/:id/ops`
- **Шаблоны** — `GET/POST /templates`, `PATCH/PUT/DELETE /templates/:id`,
  `POST /templates/:id/copy`
- **Исключения** — `GET/PUT /exclusions`
- **Вес тела** — `GET/POST /body-weight`
- **Прогресс** — `GET /progress`

## Модель доступа

Access-токен — короткий JWT (15 минут) с идентификатором сессии; на каждом
запросе он сверяется с живой строкой в `auth_sessions`. Поэтому logout, отзыв
устройства, смена пароля и удаление аккаунта гасят доступ немедленно.
Refresh-токен — непрозрачный, в БД хранится только его SHA-256; при каждом
refresh он ротируется, а повторное использование отозванного токена гасит все
сессии пользователя.

## Развёртывание

### Docker Compose

```bash
# Задайте POSTGRES_PASSWORD, JWT_SECRET, APP_ORIGINS и SMTP_HOST
docker compose up --build
```

Поднимаются PostgreSQL и сервер. `docker-compose.yml` ждёт готовности БД,
сервер сам прогоняет миграции и посев. **Обязательно** замените `JWT_SECRET`
и, при реальной почте, переключите `EMAIL_MODE` на `smtp`.

### Переменные окружения

Полный список с пояснениями — в [`.env.example`](./.env.example). Ключевые:
`DATABASE_URL`, `JWT_SECRET` (≥32 символа), `APP_ORIGINS`, `EMAIL_MODE`,
`MIGRATIONS_DIR`, `REFERENCE_DIR`.

Подробности реализации и оставшаяся работа: [docs/backend.md](../../docs/backend.md).
