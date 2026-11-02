import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createTestEnv,
  firstExerciseName,
  registerUser,
  uuid,
  type RegisteredUser,
  type TestEnv,
} from './helpers.js';

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

async function completeWorkoutWithBestSet(): Promise<void> {
  const start = await api(env.app, 'POST', '/api/v1/workouts', {
    token: user.accessToken,
    body: {
      type: 'Full Body',
      volume: 'Стандартная',
      exercises: [{ name: exA, position: 1, defaultSets: 2 }],
    },
  });
  const session = start.body.session;
  const exId = session.exercises[0].id as string;

  await api(env.app, 'POST', `/api/v1/workouts/${session.id}/ops`, {
    token: user.accessToken,
    body: {
      expectedRevision: session.revision,
      ops: [
        {
          type: 'set_upsert',
          operationId: uuid(),
          payload: { sessionExerciseId: exId, setNumber: 1, weight: 100, reps: 8, completedAt: new Date().toISOString() },
        },
        {
          type: 'set_upsert',
          operationId: uuid(),
          payload: { sessionExerciseId: exId, setNumber: 2, weight: 80, reps: 10, completedAt: new Date().toISOString() },
        },
        {
          type: 'exercise_status',
          operationId: uuid(),
          payload: { sessionExerciseId: exId, status: 'completed' },
        },
      ],
    },
  });
  await api(env.app, 'POST', `/api/v1/workouts/${session.id}/ops`, {
    token: user.accessToken,
    body: { expectedRevision: 2, ops: [{ type: 'finish', operationId: uuid(), payload: {} }] },
  });
}

describe('прогресс по лучшему подходу', () => {
  it('строит точку графика из лучшего подхода завершённой тренировки', async () => {
    await completeWorkoutWithBestSet();

    const res = await api(env.app, 'GET', '/api/v1/progress', { token: user.accessToken });
    expect(res.status).toBe(200);
    const series = res.body.series as Array<{
      exerciseName: string;
      points: Array<{ weightKg: string; reps: number; }>;
    }>;
    const point = series.find((s) => s.exerciseName === exA);
    expect(point).toBeDefined();
    expect(point!.points).toHaveLength(1);
    expect(Number(point!.points[0]!.weightKg)).toBe(100);
    expect(point!.points[0]!.reps).toBe(8);
  });

  it('пуст без завершённых тренировок', async () => {
    const res = await api(env.app, 'GET', '/api/v1/progress', { token: user.accessToken });
    expect(res.body.series).toHaveLength(0);
  });
});

describe('вес тела', () => {
  it('обновляет значение за тот же день и копит разные дни', async () => {
    await api(env.app, 'POST', '/api/v1/body-weight', {
      token: user.accessToken,
      body: { measuredAt: '2026-01-05', value: 82.4 },
    });
    await api(env.app, 'POST', '/api/v1/body-weight', {
      token: user.accessToken,
      body: { measuredAt: '2026-01-05', value: 81.9 },
    });
    await api(env.app, 'POST', '/api/v1/body-weight', {
      token: user.accessToken,
      body: { measuredAt: '2026-02-01', value: 80.5, unit: 'kg' },
    });

    const list = await api(env.app, 'GET', '/api/v1/body-weight', { token: user.accessToken });
    expect(list.body.entries).toHaveLength(2);
    expect(list.body.entries[0]).toMatchObject({ measuredAt: '2026-01-05', value: '81.90' });
    expect(list.body.entries[1]).toMatchObject({ measuredAt: '2026-02-01', value: '80.50' });
  });
});

it('исключает незавершённые подходы и пропущенные упражнения из прогресса', async () => {
  await completeWorkoutWithBestSet();
  const activeHistory = await api(env.app, 'GET', '/api/v1/workouts', { token: user.accessToken });
  const sessionId = activeHistory.body.history[0].id;
  const snapshot = await api(env.app, 'GET', `/api/v1/workouts/${sessionId}`, { token: user.accessToken });
  const exerciseId = snapshot.body.session.exercises[0].id;
  const correction = await api(env.app, 'POST', `/api/v1/workouts/${sessionId}/ops`, {
    token: user.accessToken,
    body: {
      expectedRevision: snapshot.body.session.revision, ops: [
        { type: 'set_upsert', operationId: uuid(), payload: { sessionExerciseId: exerciseId, setNumber: 1, weight: 999, completedAt: null } },
      ]
    },
  });
  expect(correction.status).toBe(200);
  const progress = await api(env.app, 'GET', '/api/v1/progress', { token: user.accessToken });
  expect(Number(progress.body.series[0].points[0].weightKg)).toBe(80);
  const skipped = await api(env.app, 'POST', `/api/v1/workouts/${sessionId}/ops`, {
    token: user.accessToken,
    body: {
      expectedRevision: correction.body.session.revision, ops: [
        { type: 'exercise_status', operationId: uuid(), payload: { sessionExerciseId: exerciseId, status: 'skipped' } },
      ]
    },
  });
  expect(skipped.status).toBe(200);
  expect((await api(env.app, 'GET', '/api/v1/progress', { token: user.accessToken })).body.series).toEqual([]);
});
