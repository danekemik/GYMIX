import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { authSessions } from '@gymix/db/schema';
import { HttpError } from './errors.js';
import type { AppContext } from './app.js';

export const PRINCIPAL_KEY = 'principal';

export interface Principal {
  userId: string;
  deviceId: string;
}

/**
 * Проверка Bearer-токена. Access-токен короткоживущий, но дополнительно
 * сверяется с живой сессией в БД: logout, отзыв устройства, смена пароля
 * и удаление аккаунта гасят доступ немедленно, а не через 15 минут.
 */
export function requireAuth(ctx: AppContext) {
  return async (c: Context, next: Next): Promise<void> => {
    const header = c.req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw HttpError.unauthorized();
    }
    const token = header.slice('Bearer '.length).trim();
    const claims = await ctx.tokens.verifyAccess(token);

    const [session] = await ctx.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, claims.sessionId));
    const now = ctx.clock();
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime() ||
      session.userId !== claims.userId
    ) {
      throw HttpError.unauthorized('Сессия недействительна, войдите заново');
    }

    c.set(PRINCIPAL_KEY, { userId: session.userId, deviceId: session.deviceId });
    await next();
  };
}

export function getPrincipal(c: Context): Principal {
  return c.get(PRINCIPAL_KEY);
}

export function resolveDeviceLabel(c: Context): string {
  const ua = c.req.header('user-agent') ?? '';
  const clean = ua.trim().slice(0, 200);
  return clean || 'Неизвестное устройство';
}