import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Hono } from 'hono';
import { seed } from '@gymix/db';
import type { Db } from '@gymix/db/seed-data';
import { loadCatalog } from '@gymix/catalog';
import { createApp, type AppContext } from '../src/app.js';
import { createPostgresTestDb } from './postgres.js';
import { createTokenService } from '../src/tokens.js';
import { createMailer } from '../src/mailer.js';
import { createLogger } from '../src/logger.js';
import type { AppConfig } from '../src/env.js';

/**
 * Тестовое окружение: PGlite (тот же диалект, что и продовый PostgreSQL)
 * + приложение честно проходит через HTTP-слой Hono (`app.request`).
 */

export const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../packages/db/drizzle', import.meta.url),
);

export function testConfig(): AppConfig {
  return {
    env: 'test',
    port: 0,
    databaseUrl: 'postgres://unused',
    origins: [],
    migrationsDir: null,
    referenceDir: null,
    runMigrations: false,
    runSeed: false,
    emailMode: 'console',
    smtp: { host: '', port: 587, secure: false, user: null, pass: null },
    mailFrom: 'Gymix <no-reply@gymix.app>',
    jwtSecret: 'test-secret-0123456789abcdef0123456789abcdef',
    accessTtlMs: 15 * 60_000,
    refreshTtlMs: 30 * 86_400_000,
    jobIntervalMs: 60_000,
    trustProxy: false,
  };
}

export interface TestEnv {
  ctx: AppContext;
  app: Hono;
  db: Db;
  close: () => Promise<void>;
}

export async function createTestEnv(): Promise<TestEnv> {
  const postgresUrl = process.env['TEST_DATABASE_URL'];
  const storage = postgresUrl
    ? await createPostgresTestDb(postgresUrl, MIGRATIONS_DIR)
    : await createPgliteTestDb();
  const { db } = storage;
  await seed(db);

  const config = testConfig();
  const logger = createLogger('test');
  const clock = (): Date => new Date();
  const tokens = createTokenService(config.jwtSecret, config.accessTtlMs, clock);
  const mailer = createMailer(config, logger);
  const ctx: AppContext = { config, logger, db, tokens, mailer, clock };
  const app = createApp(ctx);

  return {
    ctx,
    app,
    db,
    close: storage.close,
  };
}

async function createPgliteTestDb() {
  const pglite = new PGlite();
  const pgDb = drizzle(pglite);
  await migrate(pgDb, { migrationsFolder: MIGRATIONS_DIR });
  return { db: pgDb as unknown as Db, close: () => pglite.close() };
}

export interface ApiResult {
  status: number;
  body: any;
}

const installations = new Map<string, string>();

export async function api(
  app: Hono,
  method: string,
  path: string,
  init?: { body?: unknown; token?: string; headers?: Record<string, string>; },
): Promise<ApiResult> {
  const headers = new Headers(init?.headers ?? {});
  headers.set('Content-Type', 'application/json');
  headers.set('User-Agent', init?.headers?.['User-Agent'] ?? 'e2e-test');
  if (init?.token) headers.set('Authorization', `Bearer ${init.token}`);
  const request: RequestInit = { method, headers };
  if (init?.body !== undefined) {
    let body = init.body;
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/verify-email') {
      const agent = headers.get('User-Agent')!;
      if (!installations.has(agent)) installations.set(agent, crypto.randomUUID());
      body = { installationId: installations.get(agent), ...(body as object) };
    }
    request.body = JSON.stringify(body);
  }
  const res = await app.request(path, request);
  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

export const catalog = loadCatalog();
export const firstExerciseName = catalog.exercises[0]!.name;
export const secondExerciseName = catalog.exercises[1]!.name ?? catalog.exercises[0]!.name;

export interface RegisteredUser {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

/** Регистрация + подтверждение кода + (опционально) вход со второго устройства. */
export async function registerUser(
  app: Hono,
  ctx: AppContext,
  email = `user-${crypto.randomUUID()}@example.com`,
  password = 'very-secret-123',
): Promise<RegisteredUser> {
  const reg = await api(app, 'POST', '/api/v1/auth/register', {
    body: { email, password },
  });
  if (reg.status !== 201) throw new Error(`register failed: ${JSON.stringify(reg)}`);

  const code = ctx.mailer.sent.at(-1)?.code;
  if (!code) throw new Error('код не отправлен');

  const verify = await api(app, 'POST', '/api/v1/auth/verify-email', {
    body: { email, code },
  });
  if (verify.status !== 200) throw new Error(`verify failed: ${JSON.stringify(verify)}`);
  return {
    email,
    password,
    accessToken: verify.body.accessToken,
    refreshToken: verify.body.refreshToken,
    deviceId: verify.body.deviceId,
  };
}

/** Вход на второе устройство (другой User-Agent → отдельная сессия). */
export async function loginOnDevice(
  app: Hono,
  email: string,
  password: string,
  userAgent: string,
): Promise<{ accessToken: string; refreshToken: string; deviceId: string; }> {
  const res = await api(app, 'POST', '/api/v1/auth/login', {
    body: { email, password },
    headers: { 'User-Agent': userAgent },
  });
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res)}`);
  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    deviceId: res.body.deviceId,
  };
}

export function authToken(user: { accessToken: string; }): string {
  return user.accessToken;
}

export function uuid(): string {
  return crypto.randomUUID();
}