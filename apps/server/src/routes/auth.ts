import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { authSessions, devices, users } from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { HttpError } from '../errors.js';
import { getPrincipal, requireAuth, resolveDeviceLabel } from '../auth-mid.js';
import { normalizeEmail, rateLimit, readJson } from '../web.js';
import { hashPassword, verifyPassword } from '../crypto.js';
import {
  changePassword,
  consumeCode,
  createAndSendCode,
  endorsePasswordReset,
  findByEmail,
  issueTokens,
  refreshAccess,
  sendPasswordReset,
  toPublicUser,
  validatePassword,
} from '../auth/service.js';

const emailSchema = z.string().email().max(254);

export function authRouter(ctx: AppContext): Hono {
  const app = new Hono();
  const limit = (max: number) => rateLimit(ctx, 'auth', max, 15 * 60_000);

  app.post('/auth/register', limit(10), async (c) => {
    const body = z
      .object({ email: emailSchema, password: z.string() })
      .parse(await readJson(c));
    const email = normalizeEmail(body.email);
    validatePassword(body.password);
    const passwordHash = await hashPassword(body.password);

    const existing = await findByEmail(ctx.db, email);
    if (existing?.deletedAt) {
      // Повторная регистрация в grace-период восстанавливает аккаунт.
      await ctx.db
        .update(users)
        .set({ deletedAt: null, passwordHash, updatedAt: ctx.clock() })
        .where(eq(users.id, existing.id));
      await createAndSendCode(ctx, { userId: existing.id, email, purpose: 'signup' });
      return c.json(
        { email, needsVerification: true, restored: true },
        201,
      );
    }
    if (existing) {
      throw new HttpError(409, 'email_taken', 'Почта уже зарегистрирована');
    }

    const [user] = await ctx.db
      .insert(users)
      .values({ email, passwordHash })
      .returning();
    await createAndSendCode(ctx, { userId: user!.id, email, purpose: 'signup' });
    return c.json({ email, needsVerification: true }, 201);
  });

  app.post('/auth/verify-email', limit(10), async (c) => {
    const body = z
      .object({ email: emailSchema, code: z.string().min(6).max(6) })
      .parse(await readJson(c));
    const email = normalizeEmail(body.email);
    const ok = await consumeCode(ctx, { email, purpose: 'signup', code: body.code });
    if (!ok) {
      throw new HttpError(400, 'invalid_code', 'Неверный или истёкший код');
    }
    const user = await findByEmail(ctx.db, email);
    if (!user) throw new HttpError(400, 'invalid_code', 'Аккаунт не найден');
    if (user.deletedAt) {
      throw new HttpError(403, 'account_deleted', 'Аккаунт в периоде удаления');
    }
    if (!user.emailVerifiedAt) {
      await ctx.db
        .update(users)
        .set({ emailVerifiedAt: ctx.clock(), updatedAt: ctx.clock() })
        .where(eq(users.id, user.id));
    }
    const tokens = await issueTokens(ctx, user, resolveDeviceLabel(c));
    return c.json({
      user: { ...toPublicUser(user), emailVerifiedAt: ctx.clock().toISOString() },
      deviceId: tokens.deviceId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  app.post('/auth/resend-code', limit(5), async (c) => {
    const body = z
      .object({
        email: emailSchema,
        purpose: z.enum(['signup', 'password_reset']).default('signup'),
      })
      .parse(await readJson(c));
    const email = normalizeEmail(body.email);
    const user = await findByEmail(ctx.db, email);
    if (body.purpose === 'signup') {
      if (!user || user.emailVerifiedAt) {
        return c.json({ email, needsVerification: false });
      }
    }
    const input: { userId?: string; email: string; purpose: 'signup' | 'password_reset' } = {
      email,
      purpose: body.purpose,
    };
    if (user) input.userId = user.id;
    await createAndSendCode(ctx, input);
    return c.json({ email, needsVerification: body.purpose === 'signup' });
  });

  app.post('/auth/login', limit(10), async (c) => {
    const body = z
      .object({ email: emailSchema, password: z.string() })
      .parse(await readJson(c));
    const email = normalizeEmail(body.email);
    const user = await findByEmail(ctx.db, email);
    if (!user) {
      throw new HttpError(401, 'invalid_credentials', 'Неверная почта или пароль');
    }
    if (user.deletedAt) {
      throw new HttpError(403, 'account_deleted', 'Аккаунт помечен на удаление');
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'invalid_credentials', 'Неверная почта или пароль');
    }
    if (!user.emailVerifiedAt) {
      throw new HttpError(
        403,
        'requires_verification',
        'Подтвердите email перед входом',
      );
    }
    const tokens = await issueTokens(ctx, user, resolveDeviceLabel(c));
    return c.json({
      user: toPublicUser(user),
      deviceId: tokens.deviceId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  app.post('/auth/refresh', limit(30), async (c) => {
    const body = z.object({ refreshToken: z.string().min(16) }).parse(await readJson(c));
    const result = await refreshAccess(ctx, body.refreshToken);
    return c.json({
      user: { email: result.email },
      deviceId: result.tokens.deviceId,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
  });

  app.post('/auth/password/reset', limit(5), async (c) => {
    const body = z.object({ email: emailSchema }).parse(await readJson(c));
    await sendPasswordReset(ctx, normalizeEmail(body.email));
    return c.json({ ok: true });
  });

  app.post('/auth/password/reset/confirm', limit(10), async (c) => {
    const body = z
      .object({
        email: emailSchema,
        code: z.string().min(6).max(6),
        newPassword: z.string(),
      })
      .parse(await readJson(c));
    await endorsePasswordReset(ctx, {
      email: normalizeEmail(body.email),
      code: body.code,
      newPassword: body.newPassword,
    });
    return c.json({ ok: true });
  });

  app.post('/auth/password/change', limit(10), requireAuth(ctx), async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const body = z
      .object({ currentPassword: z.string(), newPassword: z.string() })
      .parse(await readJson(c));
    await changePassword(
      ctx,
      { currentPassword: body.currentPassword, newPassword: body.newPassword },
      userId,
      deviceId,
    );
    return c.json({ ok: true });
  });

  app.post('/auth/logout', requireAuth(ctx), async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    await ctx.db
      .delete(authSessions)
      .where(and(eq(authSessions.userId, userId), eq(authSessions.deviceId, deviceId)));
    return c.body(null, 204);
  });

  app.post('/auth/logout-all', requireAuth(ctx), async (c) => {
    const { userId } = getPrincipal(c);
    await ctx.db.delete(authSessions).where(eq(authSessions.userId, userId));
    return c.body(null, 204);
  });

  app.get('/auth/devices', requireAuth(ctx), async (c) => {
    const { userId, deviceId } = getPrincipal(c);
    const rows = await ctx.db
      .select()
      .from(devices)
      .where(eq(devices.userId, userId))
      .orderBy(devices.lastSeenAt);
    return c.json({
      devices: rows.map((device) => ({
        id: device.id,
        label: device.label,
        lastSeenAt: device.lastSeenAt.toISOString(),
        current: device.id === deviceId,
      })),
    });
  });

  app.delete('/auth/devices/:id', requireAuth(ctx), async (c) => {
    const { userId } = getPrincipal(c);
    const deviceId = z.string().uuid().parse(c.req.param('id'));
    await ctx.db
      .delete(authSessions)
      .where(and(eq(authSessions.userId, userId), eq(authSessions.deviceId, deviceId)));
    await ctx.db
      .delete(devices)
      .where(and(eq(devices.userId, userId), eq(devices.id, deviceId)));
    return c.body(null, 204);
  });

  return app;
}