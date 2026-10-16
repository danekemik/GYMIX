import { afterAll, beforeEach, expect, it } from 'vitest';
import type { SyncRecord, WorkoutEntity } from '@gymix/contracts';
import { api, createTestEnv, firstExerciseName, registerUser, loginOnDevice, uuid, type TestEnv, type RegisteredUser } from './helpers';
let env: TestEnv, user: RegisteredUser;
beforeEach(async () => { if (env) await env.close(); env = await createTestEnv(); user = await registerUser(env.app, env.ctx); });
afterAll(async () => { await env.close(); });
async function record(key: string, token = user.accessToken): Promise<SyncRecord> {
  const snapshot = await api(env.app, 'GET', '/api/v1/sync/snapshot', { token });
  expect(snapshot.status).toBe(200);
  return snapshot.body.records.find((x: SyncRecord) => x.key === key) ?? { key, version: null, payload: null };
}
async function start() {
  const start = await api(env.app, 'POST', '/api/v1/workouts', { token: user.accessToken, body: { type: 'Push', volume: 'Компактная', exercises: [{ name: firstExerciseName, position: 1 }] } });
  expect(start.status).toBe(201); return record(`workout:${start.body.session.id}`);
}
const change = (token: string, body: unknown) => api(env.app, 'POST', '/api/v1/sync/change', { token, body });
it('передаёт активную тренировку явно и сохраняет защиту владения после передачи', async () => {
  const current = await start();
  const second = await loginOnDevice(env.app, user.email, user.password, 'sync-second');
  const blocked = await change(second.accessToken, { operationId: uuid(), key: current.key, baseVersion: current.version, payload: current.payload });
  expect(blocked.body.reason).toBe('ownership_required');
  const claimed = await change(second.accessToken, { operationId: uuid(), key: current.key, baseVersion: current.version, payload: null, claim: true });
  expect(claimed.body.accepted).toBe(true); expect(claimed.body.record.payload.owningDeviceId).toBe(second.deviceId);
  const oldOwner = await change(user.accessToken, { operationId: uuid(), key: current.key, baseVersion: claimed.body.record.version, payload: current.payload });
  expect(oldOwner.body.reason).toBe('ownership_required');
  const complete = structuredClone(claimed.body.record.payload) as WorkoutEntity;
  complete.status = 'completed'; complete.completedAt = new Date().toISOString();
  complete.intervals.forEach(x => { x.endedAt ??= complete.completedAt; });
  const empty = await change(second.accessToken, { operationId: uuid(), key: current.key, baseVersion: claimed.body.record.version, payload: complete });
  expect(empty.body.reason).toBe('operation_rejected');
  complete.exercises[0]!.status = 'completed';
  complete.intervals.forEach(x => { x.endedAt ??= complete.completedAt; });
  const finished = await change(second.accessToken, { operationId: uuid(), key: current.key, baseVersion: claimed.body.record.version, payload: complete });
  expect(finished.body.accepted).toBe(true);
  const edited = structuredClone(finished.body.record.payload) as WorkoutEntity;
  edited.exercises[0]!.sets[0]!.weight = '45'; edited.exercises[0]!.sets[0]!.reps = 8;
  const history = await change(user.accessToken, { operationId: uuid(), key: current.key, baseVersion: finished.body.record.version, payload: edited });
  expect(history.body.accepted).toBe(true);
});
it('повтор удаления переживает потерянный ответ, а подмена operationId запрещена', async () => {
  const current = await start();
  const request = { operationId: uuid(), key: current.key, baseVersion: current.version, payload: null };
  const removed = await change(user.accessToken, request); expect(removed.body.accepted).toBe(true);
  const repeated = await change(user.accessToken, request); expect(repeated.body).toEqual(removed.body);
  expect((await record(current.key)).payload).toBeNull();
  expect((await change(user.accessToken, { ...request, baseVersion: null, payload: current.payload })).status).toBe(409);
});
it('не позволяет записать чужой UUID и не выдаёт данные другого аккаунта', async () => {
  const current = await start(); const stranger = await registerUser(env.app, env.ctx);
  const attack = await change(stranger.accessToken, { operationId: uuid(), key: current.key, baseVersion: null, payload: current.payload });
  expect(attack.status).toBe(404);
  expect((await record(current.key)).version).toBe(current.version);
  const other = await api(env.app, 'GET', '/api/v1/sync/snapshot', { token: stranger.accessToken });
  expect(other.body.records.some((x: SyncRecord) => x.key === current.key)).toBe(false);
});
it('обнаруживает изменения через обычный REST и не перезаписывает их устаревшей копией', async () => {
  await api(env.app, 'POST', '/api/v1/body-weight', { token: user.accessToken, body: { measuredAt: '2026-10-16', value: 80 } });
  const previous = await record('weight:2026-10-16');
  await api(env.app, 'POST', '/api/v1/body-weight', { token: user.accessToken, body: { measuredAt: '2026-10-16', value: 81 } });
  const result = await change(user.accessToken, { operationId: uuid(), key: previous.key, baseVersion: previous.version, payload: { kind: 'weight', id: '2026-10-16', value: '79' } });
  expect(result.body.reason).toBe('conflict'); expect(result.body.record.payload.value).toBe('81');
});
