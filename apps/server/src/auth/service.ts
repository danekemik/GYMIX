import { and, desc, eq, isNull, ne } from 'drizzle-orm';
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
  user: { id: string; },
  deviceLabel: string,
  installationId: string = crypto.randomUUID(),
): Promise<IssuedTokens> {
  const now = ctx.clock();
  const device = await findOrCreateDevice(ctx.db, user.id, installationId, deviceLabel, now);
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
  installationId: string,
  label: string,
  now: Date,
): Promise<{ id: string; }> {
  const [device] = await db.insert(devices)
    .values({ userId, installationId, label, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [devices.userId, devices.installationId],
      set: { label, lastSeenAt: now, revokedAt: null },
    })
    .returning({ id: devices.id });
  return device!;
}

/** Создание кода подтверждения с кулдауном и отправкой. */
export async function createAndSendCode(
  ctx: AppContext,
  input: { userId?: string; email: string; purpose: 'signup' | 'password_reset'; pendingPasswordHash?: string; },
): Promise<void> {
  const now = ctx.clock();
  const code = generateEmailCode();
  await ctx.db.transaction(async (tx) => {
    // Serialize code creation for one account, including the cooldown check.
    if (input.userId) {
      await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, input.userId)).for('update');
    }
    const [latest] = await tx.select().from(emailCodes)
      .where(and(eq(emailCodes.email, input.email), eq(emailCodes.purpose, input.purpose)))
      .orderBy(desc(emailCodes.createdAt)).limit(1);
    if (latest && !latest.consumedAt && now.getTime() - latest.createdAt.getTime() < CODE_COOLDOWN_MS) {
      throw new HttpError(429, 'rate_limited', 'Код уже отправлен, подождите минуту');
    }
    await tx.insert(emailCodes).values({
      userId: input.userId ?? null,
      email: input.email,
      purpose: input.purpose,
      codeHash: codeDigest(ctx.config.jwtSecret, input.purpose, input.email, code),
      pendingPasswordHash: input.pendingPasswordHash ??
        (input.purpose === 'signup' ? latest?.pendingPasswordHash ?? null : null),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });
  });
  await ctx.mailer.sendCode(input.email, code, input.purpose);
}

export async function consumeCode(
  ctx: AppContext,
  input: { email: string; purpose: 'signup' | 'password_reset'; code: string; },
  db: Db = ctx.db,
): Promise<typeof emailCodes.$inferSelect | null> {
  const now = ctx.clock();
  const [row] = await db.select().from(emailCodes)
    .where(and(eq(emailCodes.email, input.email), eq(emailCodes.purpose, input.purpose)))
    .orderBy(desc(emailCodes.createdAt)).limit(1);
  if (!row || row.consumedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  const expected = codeDigest(ctx.config.jwtSecret, input.purpose, input.email, input.code);
  if (!safeEqual(expected, row.codeHash)) return null;
  // Conditional consumption prevents two requests from using the same code.
  const consumed = await db.update(emailCodes).set({ consumedAt: now })
    .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)))
    .returning();
  return consumed[0] ?? null;
}

export async function verifyEmail(ctx: AppContext, email: string, code: string) {
  return ctx.db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.email, email)).for('update');
    if (!user) throw new HttpError(400, 'invalid_code', 'Неверный или истёкший код');
    const proof = await consumeCode(ctx, { email, purpose: 'signup', code }, tx);
    if (!proof || proof.userId !== user.id) {
      throw new HttpError(400, 'invalid_code', 'Неверный или истёкший код');
    }
    const now = ctx.clock();
    if (user.deletedAt && (!proof.pendingPasswordHash ||
      user.deletedAt.getTime() + 7 * 86_400_000 <= now.getTime())) {
      throw new HttpError(403, 'account_deleted', 'Срок восстановления аккаунта истёк');
    }
    const [verified] = await tx.update(users).set({
      emailVerifiedAt: user.emailVerifiedAt ?? now,
      deletedAt: null,
      passwordHash: user.deletedAt ? proof.pendingPasswordHash! : user.passwordHash,
      updatedAt: now,
    }).where(eq(users.id, user.id)).returning();
    return verified!;
  });
}

export async function sendPasswordReset(ctx: AppContext, email: string): Promise<void> {
  const user = await findByEmail(ctx.db, email);
  if (!user) return; // не раскрываем существование аккаунта
  if (user.deletedAt) return; // аккаунт в периоде удаления — не тревожим
  await createAndSendCode(ctx, { userId: user.id, email, purpose: 'password_reset' });
}

export async function endorsePasswordReset(
  ctx: AppContext,
  input: { email: string; code: string; newPassword: string; },
): Promise<void> {
  validatePassword(input.newPassword);
  const passwordHash = await hashPassword(input.newPassword);
  await ctx.db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.email, input.email)).for('update');
    if (!user || user.deletedAt) throw new HttpError(400, 'invalid_code', 'Неверный или истёкший код');
    const proof = await consumeCode(ctx, { email: input.email, purpose: 'password_reset', code: input.code }, tx);
    if (!proof || proof.userId !== user.id) throw new HttpError(400, 'invalid_code', 'Неверный или истёкший код');
    await tx.update(users).set({ passwordHash, updatedAt: ctx.clock() }).where(eq(users.id, user.id));
    await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
  });
}

export async function changePassword(
  ctx: AppContext,
  input: { currentPassword: string; newPassword: string; },
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
): Promise<{ tokens: IssuedTokens; email: string; }> {
  const hash = ctx.tokens.hashRefreshToken(refreshToken);
  const now = ctx.clock();
  const result = await ctx.db.transaction(async (tx) => {
    const [session] = await tx.select().from(authSessions)
      .where(eq(authSessions.refreshHash, hash)).for('update');
    if (!session || session.expiresAt.getTime() <= now.getTime()) return null;
    if (session.revokedAt) {
      await tx.update(authSessions).set({ revokedAt: now })
        .where(eq(authSessions.userId, session.userId));
      return null;
    }
    const [user] = await tx.select().from(users).where(eq(users.id, session.userId));
    const [device] = await tx.select().from(devices).where(eq(devices.id, session.deviceId));
    if (!user || user.deletedAt || !device || device.revokedAt) return null;
    const { token, hash: newHash } = ctx.tokens.createRefreshToken();
    await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.id, session.id));
    const [created] = await tx.insert(authSessions).values({
      userId: session.userId, deviceId: session.deviceId, refreshHash: newHash,
      expiresAt: new Date(now.getTime() + ctx.config.refreshTtlMs),
    }).returning({ id: authSessions.id });
    await tx.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, session.deviceId));
    const accessToken = await ctx.tokens.signAccess({
      userId: session.userId, deviceId: session.deviceId, sessionId: created!.id,
    });
    return { tokens: { accessToken, refreshToken: token, deviceId: session.deviceId }, email: user.email };
  });
  if (!result) throw new HttpError(401, 'invalid_refresh', 'Сессия недействительна, войдите заново');
  return result;
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
