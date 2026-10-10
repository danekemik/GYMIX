import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  authSessions,
  emailCodes,
  users,
  workoutSessions,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import { createTestEnv, registerUser, uuid, type RegisteredUser, type TestEnv } from './helpers.js';
import {
  JobRunner,
  cleanupExpiredAuthSessions,
  cleanupExpiredCodes,
  cleanupStaleSessions,
  finalizeDeletedAccounts,
} from '../src/jobs.js';

let env: TestEnv;
let user: RegisteredUser;

const DAY = 86_400_000;

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
  user = await registerUser(env.app, env.ctx);
});

afterAll(async () => {
  if (env) await env.close();
});

async function userId(): Promise<string> {
  const [row] = await env.db.select().from(users).where(eq(users.email, user.email));
  return row!.id;
}

describe('фоновая очистка', () => {
  it('удаляет истёкшие refresh-сессии, но не активные', async () => {
    const id = await userId();
    const now = env.ctx.clock();
    await env.db.insert(authSessions).values({
      userId: id,
      deviceId: user.deviceId,
      refreshHash: 'expired-hash',
      expiresAt: new Date(now.getTime() - DAY),
    });

    const removed = await cleanupExpiredAuthSessions(env.db, now);
    expect(removed).toBe(1);

    const remaining = await env.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, id));
    expect(remaining).toHaveLength(1);
  });

  it('удаляет истёкшие коды подтверждения', async () => {
    const now = env.ctx.clock();
    await env.db.insert(emailCodes).values({
      email: 'expired@example.com',
      purpose: 'signup',
      codeHash: 'x',
      expiresAt: new Date(now.getTime() - 60_000),
    });
    expect(await cleanupExpiredCodes(env.db, now)).toBe(1);
  });

  it('удаляет незавершённые тренировки старше 30 дней', async () => {
    const id = await userId();
    const [type] = await env.db.select().from(workoutTypes).limit(1);
    const [volume] = await env.db.select().from(workoutVolumes).limit(1);
    const now = env.ctx.clock();
    await env.db.insert(workoutSessions).values({
      userId: id,
      typeId: type!.id,
      volumeId: volume!.id,
      owningDeviceId: user.deviceId,
      startedAt: new Date(now.getTime() - 40 * DAY),
    });
    await env.db.insert(workoutSessions).values({
      userId: id,
      typeId: type!.id,
      volumeId: volume!.id,
      owningDeviceId: user.deviceId,
      startedAt: new Date(now.getTime() - 1 * DAY),
    });

    expect(await cleanupStaleSessions(env.db, now)).toBe(1);
  });

  it('стирает аккаунт только после истечения grace-периода', async () => {
    const id = await userId();
    const now = env.ctx.clock();
    await env.db
      .update(users)
      .set({ deletedAt: new Date(now.getTime() - 8 * DAY) })
      .where(eq(users.id, id));

    expect(await finalizeDeletedAccounts(env.db, now)).toBe(1);
  });

  it('планировщик прогоняет все задачи без ошибок', async () => {
    const runner = new JobRunner(env.ctx);
    await expect(runner.tick()).resolves.toBeUndefined();
    await expect(runner.tick()).resolves.toBeUndefined();
    runner.stop();
  });
});

describe('uuid', () => {
  it('генерирует валидные уникальные идентификаторы', () => {
    const a = uuid();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(uuid());
  });
});
