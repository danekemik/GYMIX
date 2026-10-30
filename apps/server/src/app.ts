import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { AppConfig } from './env.js';
import type { Logger } from './logger.js';
import type { TokenService } from './tokens.js';
import type { Mailer } from './mailer.js';
import { HttpError, isHttpError } from './errors.js';
import { accountRouter } from './routes/account.js';
import { authRouter } from './routes/auth.js';
import { bodyWeightRouter } from './routes/bodyWeight.js';
import { exclusionsRouter } from './routes/exclusions.js';
import { healthRouter } from './routes/health.js';
import { progressRouter } from './routes/progress.js';
import { templatesRouter } from './routes/templates.js';
import { syncRouter } from './routes/sync.js';
import { workoutsRouter } from './routes/workouts.js';

/**
 * Контекст приложения: всё, что нужно роутам. Тесты собирают такой же
 * контекст на PGlite, поэтому `createApp` остаётся чистым и не открывает
 * реальных соединений.
 */

export type Db = PgDatabase<PgQueryResultHKT>;

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  db: Db;
  tokens: TokenService;
  mailer: Mailer;
  clock: () => Date;
}

export const API_PREFIX = '/api/v1';

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  app.use('*', cors({
    origin: [...ctx.config.origins],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));

  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    await next();
  });

  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    const ms = Math.round(performance.now() - start);
    ctx.logger.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms },
      'request',
    );
  });

  app.route('/', healthRouter(ctx));
  app.route(API_PREFIX, authRouter(ctx));
  app.route(API_PREFIX, accountRouter(ctx));
  app.route(API_PREFIX, templatesRouter(ctx));
  app.route(API_PREFIX, exclusionsRouter(ctx));
  app.route(API_PREFIX, workoutsRouter(ctx));
  app.route(API_PREFIX, bodyWeightRouter(ctx));
  app.route(API_PREFIX, progressRouter(ctx));
  app.route(API_PREFIX, syncRouter(ctx));

  app.notFound(() => {
    throw HttpError.notFound('Путь не найден');
  });

  app.onError((error, c) => {
    if (isHttpError(error)) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        error.status as ContentfulStatusCode,
      );
    }
    if (error instanceof ZodError) {
      const message = error.issues[0]
        ? `${error.issues[0].path.join('.')}: ${error.issues[0].message}`
        : 'Некорректные данные запроса';
      return c.json({ error: { code: 'invalid_request', message } }, 400);
    }
    if (isUniqueViolation(error)) {
      return c.json(
        { error: { code: 'conflict', message: 'Запись уже существует' } },
        409,
      );
    }
    ctx.logger.error({ error: error.stack ?? String(error) }, 'unhandled error');
    return c.json(
      { error: { code: 'internal', message: 'Внутренняя ошибка сервера' } },
      500,
    );
  });

  return app;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; }).code;
  if (code === '23505') return true;
  const message = String(error instanceof Error ? error.message : error);
  const cause = (error as { cause?: unknown; }).cause;
  const causeText = cause instanceof Error ? cause.message : '';
  return /duplicate key|unique constraint/i.test(`${message} ${causeText}`);
}