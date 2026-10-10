import { and, desc, eq, ne } from 'drizzle-orm';
import type { Db } from '@gymix/db/seed-data';
import {
  authSessions,
  devices,
  emailCodes,
  users,
} from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { HttpError } from '../errors.js';
import {
  codeDigest,
  generateEmailCode,
  hashPassword,
  safeEqual,
  verifyPassword,
} from '../crypto.js';

/**
 * Бизнес-логика аккаунта: регистрация, подтверждение email, вход, ротация
 * refresh-токенов, отзыв устройств, смена и восстановление пароля.
 */

const CODE_TTL_MS = 15 * 60_000;
const CODE_COOLDOWN_MS = 60_000;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

export function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw HttpError.invalidRequest(
      `Пароль должен содержать от ${PASSWORD_MIN} до ${PASSWORD_MAX} символов`,
    );
  }
}

export async function issueTokens(
  ctx: AppContext,
  user: { id: string },
  deviceLabel: string,
): Promise<IssuedTokens> {
  const now = ctx.clock();
  const device = await findOrCreateDevice(ctx.db, user.id, deviceLabel, now);
  const { token: refreshToken, hash } = ctx.tokens.createRefreshToken();
  const [session] = await ctx.db
    .insert(authSessions)
    .values({
      userId: user.id,
      deviceId: device.id,
      refreshHash: hash,
      expiresAt: new Date(now.getTime() + ctx.config.refreshTtlMs),
    })
    .returning({ id: authSessions.id });
  await ctx.db
    .update(devices)
    .set({ lastSeenAt: now })
    .where(eq(devices.id, device.id));
  const accessToken = await ctx.tokens.signAccess({
    userId: user.id,
    deviceId: device.id,
    sessionId: session!.id,
  });
  return { accessToken, refreshToken, deviceId: device.id };
}

async function findOrCreateDevice(
  db: Db,
  userId: string,
  label: string,
  now: Date,
): Promise<{ id: string }> {
  const [existing] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.label, label)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(devices)
    .values({ userId, label, lastSeenAt: now })
    .returning({ id: devices.id });
  return { id: created!.id };
}

/** Создание кода подтверждения с кулдауном и отправкой. */
export async function createAndSendCode(
  ctx: AppContext,
  input: { userId?: string; email: string; purpose: 'signup' | 'password_reset' },
): Promise<void> {
  const now = ctx.clock();
  const [latest] = await ctx.db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, input.email),
        eq(emailCodes.purpose, input.purpose),
      ),
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  if (
    latest &&
    !latest.consumedAt &&
    now.getTime() - latest.createdAt.getTime() < CODE_COOLDOWN_MS
  ) {
    throw new HttpError(429, 'rate_limited', 'Код уже отправлен, подождите минуту');
  }

  const code = generateEmailCode();
  await ctx.db.insert(emailCodes).values({
    userId: input.userId ?? null,
    email: input.email,
    purpose: input.purpose,
    codeHash: codeDigest(ctx.config.jwtSecret, input.purpose, input.email, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  await ctx.mailer.sendCode(input.email, code, input.purpose);
}

export async function consumeCode(
  ctx: AppContext,
  input: { email: string; purpose: 'signup' | 'password_reset'; code: string },
): Promise<boolean> {
  const now = ctx.clock();
  const [row] = await ctx.db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, input.email),
        eq(emailCodes.purpose, input.purpose),
      ),
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  if (!row || row.consumedAt || row.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  const expected = codeDigest(
    ctx.config.jwtSecret,
    input.purpose,
    input.email,
    input.code,
  );
  if (!safeEqual(expected, row.codeHash)) return false;

  await ctx.db
    .update(emailCodes)
    .set({ consumedAt: now })
    .where(eq(emailCodes.id, row.id));
  return true;
}

export async function sendPasswordReset(ctx: AppContext, email: string): Promise<void> {
  const user = await findByEmail(ctx.db, email);
  if (!user) return; // не раскрываем существование аккаунта
  if (user.deletedAt) return; // аккаунт в периоде удаления — не тревожим
  await createAndSendCode(ctx, { userId: user.id, email, purpose: 'password_reset' });
}

export async function endorsePasswordReset(
  ctx: AppContext,
  input: { email: string; code: string; newPassword: string },
): Promise<void> {
  validatePassword(input.newPassword);
  const ok = await consumeCode(ctx, {
    email: input.email,
    purpose: 'password_reset',
    code: input.code,
  });
  if (!ok) throw new HttpError(400, 'invalid_code', 'Неверный или истёкший код');
  const user = await findByEmail(ctx.db, input.email);
  if (!user || user.deletedAt) {
    throw new HttpError(400, 'invalid_code', 'Аккаунт не найден');
  }
  const passwordHash = await hashPassword(input.newPassword);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: ctx.clock() })
      .where(eq(users.id, user.id));
    // Пароль изменён — все сессии выходят, кроме той, что выйдет следом.
    await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
  });
}

export async function changePassword(
  ctx: AppContext,
  input: { currentPassword: string; newPassword: string },
  userId: string,
  deviceId: string,
): Promise<void> {
  validatePassword(input.newPassword);
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (!user) throw HttpError.unauthorized();
  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) throw new HttpError(401, 'invalid_credentials', 'Неверный текущий пароль');

  const passwordHash = await hashPassword(input.newPassword);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: ctx.clock() })
      .where(eq(users.id, userId));
    await tx
      .delete(authSessions)
      .where(and(eq(authSessions.userId, userId), ne(authSessions.deviceId, deviceId)));
  });
}

export async function refreshAccess(
  ctx: AppContext,
  refreshToken: string,
): Promise<{ tokens: IssuedTokens; email: string }> {
  const hash = ctx.tokens.hashRefreshToken(refreshToken);
  const now = ctx.clock();

  const [session] = await ctx.db
    .select()
    .from(authSessions)
    .where(eq(authSessions.refreshHash, hash));

  if (!session) {
    throw new HttpError(401, 'invalid_refresh', 'Сессия не найдена, войдите заново');
  }
  if (session.revokedAt) {
    // Повторное использование отозванного токена — попытка кражи.
    await ctx.db.delete(authSessions).where(eq(authSessions.userId, session.userId));
    throw new HttpError(401, 'invalid_refresh', 'Сессия отозвана, войдите заново');
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new HttpError(401, 'invalid_refresh', 'Сессия истекла, войдите заново');
  }

  const [user] = await ctx.db.select().from(users).where(eq(users.id, session.userId));
  if (!user || user.deletedAt) {
    throw new HttpError(401, 'invalid_refresh', 'Аккаунт недоступен');
  }

  // Ротация: старая сессия гасится, новая выдаётся на то же устройство.
  const { token, hash: newHash } = ctx.tokens.createRefreshToken();
  const newSessionId = await ctx.db.transaction(async (tx) => {
    await tx
      .update(authSessions)
      .set({ revokedAt: now })
      .where(eq(authSessions.id, session.id));
    const [created] = await tx
      .insert(authSessions)
      .values({
        userId: session.userId,
        deviceId: session.deviceId,
        refreshHash: newHash,
        expiresAt: new Date(now.getTime() + ctx.config.refreshTtlMs),
      })
      .returning({ id: authSessions.id });
    await tx
      .update(devices)
      .set({ lastSeenAt: now })
      .where(eq(devices.id, session.deviceId));
    return created!.id;
  });

  const deviceLookup = await ctx.db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.id, session.deviceId));

  const accessToken = await ctx.tokens.signAccess({
    userId: session.userId,
    deviceId: session.deviceId,
    sessionId: newSessionId,
  });
  return {
    tokens: {
      accessToken,
      refreshToken: token,
      deviceId: deviceLookup[0]?.id ?? session.deviceId,
    },
    email: user.email,
  };
}

export interface PublicUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export function toPublicUser(user: Pick<
  typeof users.$inferSelect,
  'id' | 'email' | 'emailVerifiedAt' | 'createdAt' | 'deletedAt'
>): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
  };
}

export async function findByEmail(db: Db, email: string): Promise<typeof users.$inferSelect | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row ?? null;
}