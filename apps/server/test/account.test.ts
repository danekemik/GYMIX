import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@gymix/db/schema';
import {
  api,
  createTestEnv,
  firstExerciseName,
  registerUser,
  uuid,
  type RegisteredUser,
  type TestEnv,
} from './helpers.js';
import { finalizeDeletedAccounts } from '../src/jobs.js';

let env: TestEnv;
let user: RegisteredUser;
const exA = firstExerciseName;

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
  user = await registerUser(env.app, env.ctx);
});

afterAll(async () => {
  if (env) await env.close();
});

describe('профиль и выгрузка', () => {
  it('отдаёт профиль с числом устройств', async () => {
    const res = await api(env.app, 'GET', '/api/v1/account', { token: user.accessToken });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.emailVerifiedAt).toBeTruthy();
    expect(res.body.deviceCount).toBe(1);
  });

  it('выгружает данные без секретов', async () => {
    await api(env.app, 'POST', '/api/v1/body-weight', {
      token: user.accessToken,
      body: { measuredAt: '2026-03-01', value: 79.2 },
    });
    await api(env.app, 'PUT', '/api/v1/exclusions', {
      token: user.accessToken,
      body: { excludedNames: [exA] },
    });

    const res = await api(env.app, 'GET', '/api/v1/account/export', {
      token: user.accessToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.app).toBe('gymix');
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.exclusions).toEqual([exA]);
    expect(res.body.bodyWeight).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshHash|codeHash/);
  });
});

describe('удаление аккаунта', () => {
  it('мягко удаляет, отзывает сессии и восстанавливает при повторной регистрации', async () => {
    const del = await api(env.app, 'DELETE', '/api/v1/account', { token: user.accessToken });
    expect(del.status).toBe(200);
    expect(del.body.deletedAt).toBeTruthy();
    expect(new Date(del.body.deletableUntil).getTime()).toBeGreaterThan(
      new Date(del.body.deletedAt).getTime(),
    );

    const afterDelete = await api(env.app, 'GET', '/api/v1/account', {
      token: user.accessToken,
    });
    expect(afterDelete.status).toBe(401);

    const relogin = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: user.password },
    });
    expect(relogin.status).toBe(403);
    expect(relogin.body.error.code).toBe('account_deleted');

    const revive = await api(env.app, 'POST', '/api/v1/auth/register', {
      body: { email: user.email, password: 'fresh-secret-1' },
    });
    expect(revive.status).toBe(201);
    expect(revive.body.restored).toBe(true);
    const blocked = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: 'fresh-secret-1' },
    });
    expect(blocked.status).toBe(403);
    const [pending] = await env.db.select().from(users).where(eq(users.email, user.email));
    expect(pending!.deletedAt).not.toBeNull();
    const verify = await api(env.app, 'POST', '/api/v1/auth/verify-email', {
      body: { email: user.email, code: env.ctx.mailer.sent.at(-1)!.code },
    });
    expect(verify.status).toBe(200);
    const replay = await api(env.app, 'POST', '/api/v1/auth/verify-email', {
      body: { email: user.email, code: env.ctx.mailer.sent.at(-1)!.code },
    });
    expect(replay.status).toBe(400);

    const login = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: 'fresh-secret-1' },
    });
    expect(login.status).toBe(200);
  });

  it('безвозвратно стирает аккаунт после grace-периода', async () => {
    await api(env.app, 'DELETE', '/api/v1/account', { token: user.accessToken });

    const tooEarly = await finalizeDeletedAccounts(env.db, env.ctx.clock());
    expect(tooEarly).toBe(0);

    const later = new Date(env.ctx.clock().getTime() + 8 * 86_400_000);
    const removed = await finalizeDeletedAccounts(env.db, later);
    expect(removed).toBe(1);

    const rows = await env.db.select().from(users).where(eq(users.email, user.email));
    expect(rows).toHaveLength(0);
  });
});

describe('идентификаторы', () => {
  it('uuid операции уникален', () => {
    expect(uuid()).not.toBe(uuid());
  });
});
