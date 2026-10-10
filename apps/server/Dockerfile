# Сервер Gymix: многостадийная сборка pnpm-монорепозитория.
#
# Собираем бандл (@gymix/* вшиваются tsup-ом), затем в рантайм-образ
# ставим только production-зависимости и кладём готовый dist. Справочники
# и миграции копируются, потому что нужны при старте (посев + миграции).

# ---------- Сборка ----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable

# Манифесты отдельным слоем — кэш установки не сбрасывается на правках кода.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/structures/package.json packages/structures/package.json
COPY packages/catalog/package.json packages/catalog/package.json
COPY packages/generator/package.json packages/generator/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/server ./apps/server
COPY reference ./reference
RUN pnpm --filter @gymix/server build

# ---------- Рантайм ---------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/structures/package.json packages/structures/package.json
COPY packages/catalog/package.json packages/catalog/package.json
COPY packages/generator/package.json packages/generator/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY packages/db/drizzle ./packages/db/drizzle
COPY reference ./reference

# Значения по умолчанию; переопределяются через окружение/compose.
ENV PORT=3000 \
    MIGRATIONS_DIR=/repo/packages/db/drizzle \
    REFERENCE_DIR=/repo/reference
EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
