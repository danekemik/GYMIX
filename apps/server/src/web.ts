import type { Context, Next } from 'hono';
import { HttpError } from './errors.js';
import type { AppContext } from './app.js';
import { getConnInfo } from '@hono/node-server/conninfo';

/**
 * Короткие помощники для роутов: чтение JSON-тела, IP клиента
 * и скользящее окно rate-limit (одноинстансное, in-memory).
 */

export async function readJson(c: Context): Promise<unknown> {
  const length = Number(c.req.header('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'invalid_request', 'Тело запроса слишком большое');
  }
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'invalid_request', 'Тело запроса слишком большое');
  }
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw HttpError.invalidRequest('Некорректный JSON');
  }
}

export function getClientIp(ctx: AppContext, c: Context): string {
  if (ctx.config.trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    const first = forwarded?.split(',')[0]?.trim();
    if (first) return first;
  }
  // app.request() in tests has no socket. Production uses the actual peer,
  // ignoring forwarded headers unless a trusted proxy was explicitly enabled.
  try { return getConnInfo(c).remote.address ?? 'local'; } catch { return 'local'; }
}

const WINDOWS = new WeakMap<AppContext, Map<string, number[]>>();

function windowsFor(ctx: AppContext): Map<string, number[]> {
  let windows = WINDOWS.get(ctx);
  if (!windows) {
    windows = new Map();
    WINDOWS.set(ctx, windows);
  }
  return windows;
}

/**
 * Скользящее окно: не более `max` запросов за `windowMs` на ключ.
 * Простой in-memory лимитер подходит для одного инстанса; при
 * масштабировании его заменяют на Redis-каунтёр. Счётчики живут на
 * конкретном экземпляре приложения (AppContext).
 */
export function rateLimit(ctx: AppContext, scope: string, max: number, windowMs: number) {
  return async (c: Context, next: Next): Promise<void> => {
    const windows = windowsFor(ctx);
    const key = `${scope}:${c.req.path}:${getClientIp(ctx, c)}`;
    const now = ctx.clock().getTime();
    const cutoff = now - windowMs;
    for (const [key, timestamps] of windows) {
      if ((timestamps.at(-1) ?? 0) <= cutoff) windows.delete(key);
    }
    const hits = (windows.get(key) ?? []).filter((t) => t > cutoff);
    if (hits.length >= max) {
      throw new HttpError(
        429,
        'rate_limited',
        'Слишком много попыток, попробуйте позже',
      );
    }
    hits.push(now);
    windows.set(key, hits);
    await next();
  };
}

const MAX_BODY_BYTES = 512 * 1024;

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase();
}
