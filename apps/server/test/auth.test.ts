import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanupExpiredAuthSessions } from '../src/jobs.js';
import { api, createTestEnv, registerUser, loginOnDevice, type TestEnv } from './helpers.js';

let env: TestEnv;

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
});

afterAll(async () => {
  if (env) await env.close();
});

function codeOf(env: TestEnv): string {
  const code = env.ctx.mailer.sent.at(-1)?.code;
  if (!code) throw new Error('код не отправлен');
  return code;
}

describe('регистрация и подтверждение email', () => {
  it('полный цикл: код в почте → подтверждение → вход по паролю', async () => {
    const email = 'full@example.com';

    const reg = await api(env.app, 'POST', '/api/v1/auth/register', {
      body: { email, password: 'super-secret' },
    });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ needsVerification: true });

    const bad = await api(env.app, 'POST', '/api/v1/auth/verify-email', {
      body: { email, code: '000000' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_code');

    const verify = await api(env.app, 'POST', '/api/v1/auth/verify-email', {
      body: { email, code: codeOf(env) },
    });
    expect(verify.status).toBe(200);
    expect(verify.body.accessToken).toBeTypeOf('string');
    expect(verify.body.refreshToken).toBeTypeOf('string');
    expect(verify.body.user.emailVerifiedAt).toBeTruthy();

    const login = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email, password: 'super-secret' },
    });
    expect(login.status).toBe(200);
    expect(login.body.deviceId).toBe(verify.body.deviceId);
  });

  it('не пускает в аккаунт до подтверждения email', async () => {
    const email = 'pending@example.com';
    await api(env.app, 'POST', '/api/v1/auth/register', {
      body: { email, password: 'super-secret' },
    });
    const login = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email, password: 'super-secret' },
    });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('requires_verification');
  });

  it('отклоняет повторную регистрацию на занятый email', async () => {
    const email = 'taken@example.com';
    await api(env.app, 'POST', '/api/v1/auth/register', {
      body: { email, password: 'super-secret' },
    });
    const again = await api(env.app, 'POST', '/api/v1/auth/register', {
      body: { email, password: 'another-secret' },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('email_taken');
  });

  it('короткий пароль не принимается', async () => {
    const res = await api(env.app, 'POST', '/api/v1/auth/register', {
      body: { email: 'short@example.com', password: '123' },
    });
    expect(res.status).toBe(400);
  });

  it('повторная отправка кода упирается в кулдаун', async () => {
    const email = 'cooldown@example.com';
    await api(env.app, 'POST', '/api/v1/auth/register', {
      body: { email, password: 'super-secret' },
    });
    const resend = await api(env.app, 'POST', '/api/v1/auth/resend-code', {
      body: { email, purpose: 'signup' },
    });
    expect(resend.status).toBe(429);
    expect(resend.body.error.code).toBe('rate_limited');
  });
});

describe('сессии и токены', () => {
  it('ротация refresh-токена и отзыв всей семьи при повторном использовании', async () => {
    const user = await registerUser(env.app, env.ctx);

    const first = await api(env.app, 'POST', '/api/v1/auth/refresh', {
      body: { refreshToken: user.refreshToken },
    });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    await cleanupExpiredAuthSessions(env.db, env.ctx.clock());
    const reuse = await api(env.app, 'POST', '/api/v1/auth/refresh', {
      body: { refreshToken: user.refreshToken },
    });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('invalid_refresh');

    const afterReuse = await api(env.app, 'POST', '/api/v1/auth/refresh', {
      body: { refreshToken: first.body.refreshToken },
    });
    expect(afterReuse.status).toBe(401);
  });

  it('access-токен даёт доступ, logout его отзывает', async () => {
    const user = await registerUser(env.app, env.ctx);
    const ok = await api(env.app, 'GET', '/api/v1/account', { token: user.accessToken });
    expect(ok.status).toBe(200);

    const out = await api(env.app, 'POST', '/api/v1/auth/logout', { token: user.accessToken });
    expect(out.status).toBe(204);

    const after = await api(env.app, 'POST', '/api/v1/auth/logout', { token: user.accessToken });
    expect(after.status).toBe(401);
  });

  it('смена пароля гасит сессии других устройств', async () => {
    const user = await registerUser(env.app, env.ctx);
    const second = await loginOnDevice(env.app, user.email, user.password, 'ipad');

    const changed = await api(env.app, 'POST', '/api/v1/auth/password/change', {
      token: user.accessToken,
      body: { currentPassword: user.password, newPassword: 'brand-new-secret' },
    });
    expect(changed.status).toBe(200);

    const oldPassword = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: user.password },
    });
    expect(oldPassword.status).toBe(401);

    const newPassword = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: 'brand-new-secret' },
    });
    expect(newPassword.status).toBe(200);

    const secondDevice = await api(env.app, 'GET', '/api/v1/account', {
      token: second.accessToken,
    });
    expect(secondDevice.status).toBe(401);
  });

  it('восстановление пароля по коду из письма', async () => {
    const user = await registerUser(env.app, env.ctx);
    await api(env.app, 'POST', '/api/v1/auth/password/reset', {
      body: { email: user.email },
    });
    const code = codeOf(env);
    const confirm = await api(env.app, 'POST', '/api/v1/auth/password/reset/confirm', {
      body: { email: user.email, code, newPassword: 'reset-secret-1' },
    });
    expect(confirm.status).toBe(200);

    const login = await api(env.app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: 'reset-secret-1' },
    });
    expect(login.status).toBe(200);
  });
});

describe('устройства', () => {
  it('показывает устройства и помечает текущее', async () => {
    const user = await registerUser(env.app, env.ctx);
    await loginOnDevice(env.app, user.email, user.password, 'second-phone');

    const list = await api(env.app, 'GET', '/api/v1/auth/devices', {
      token: user.accessToken,
    });
    expect(list.status).toBe(200);
    expect(list.body.devices).toHaveLength(2);
    const current = list.body.devices.find((d: { current: boolean; }) => d.current);
    expect(current?.id).toBe(user.deviceId);
  });

  it('отзывает сессии конкретного устройства', async () => {
    const user = await registerUser(env.app, env.ctx);
    const second = await loginOnDevice(env.app, user.email, user.password, 'clicker');

    const revoke = await api(env.app, 'DELETE', `/api/v1/auth/devices/${second.deviceId}`, {
      token: user.accessToken,
    });
    expect(revoke.status).toBe(204);

    const gone = await api(env.app, 'GET', '/api/v1/account', { token: second.accessToken });
    expect(gone.status).toBe(401);
  });
});


it('различает установки с одинаковым User-Agent и сохраняет идентичность при повторном входе', async () => {
  const user = await registerUser(env.app, env.ctx);
  const installationId = crypto.randomUUID();
  const first = await api(env.app, 'POST', '/api/v1/auth/login', {
    body: { email: user.email, password: user.password, installationId },
  });
  const second = await api(env.app, 'POST', '/api/v1/auth/login', {
    body: { email: user.email, password: user.password, installationId },
  });
  expect(first.status).toBe(200);
  expect(first.body.deviceId).not.toBe(user.deviceId);
  expect(second.body.deviceId).toBe(first.body.deviceId);
});

it('одноразовый код подтверждения не выдаёт два входа при параллельных запросах', async () => {
  const email = 'parallel@example.com';
  const register = await api(env.app, 'POST', '/api/v1/auth/register', { body: { email, password: 'parallel-secret' } });
  expect(register.status).toBe(201);
  const code = codeOf(env);
  const results = await Promise.all([1, 2].map(() => api(env.app, 'POST', '/api/v1/auth/verify-email', { body: { email, code } })));
  expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
});
