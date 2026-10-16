import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createTestEnv,
  firstExerciseName,
  loginOnDevice,
  registerUser,
  secondExerciseName,
  uuid,
  type RegisteredUser,
  type TestEnv,
} from './helpers.js';

let env: TestEnv;
let user: RegisteredUser;

const exA = firstExerciseName;
const exB = secondExerciseName;
const nowIso = () => new Date().toISOString();

interface Snapshot {
  id: string;
  revision: number;
  status: 'active' | 'completed';
  type: string;
  volume: string;
  owningDeviceId: string;
  readOnly: boolean;
  countedExercises: number;
  startedAt: string;
  intervals: Array<{ startedAt: string; endedAt: string | null; }>;
  exercises: Array<{
    id: string;
    name: string;
    status: string;
    position: number;
    sets: Array<{
      id: string;
      setNumber: number;
      weight: string | null;
      reps: number | null;
      completedAt: string | null;
    }>;
  }>;
}

async function startWorkout(token: string): Promise<Snapshot> {
  const res = await api(env.app, 'POST', '/api/v1/workouts', {
    token,
    body: {
      type: 'Full Body',
      volume: 'Стандартная',
      exercises: [
        { name: exA, position: 1, defaultSets: 3 },
        { name: exB, position: 2, defaultSets: 4 },
      ],
    },
  });
  if (res.status !== 201) throw new Error(`start failed: ${JSON.stringify(res)}`);
  return res.body.session as Snapshot;
}

function postOps(token: string, sessionId: string, expectedRevision: number, ops: unknown[]) {
  return api(env.app, 'POST', `/api/v1/workouts/${sessionId}/ops`, {
    token,
    body: { expectedRevision, ops },
  });
}

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
  user = await registerUser(env.app, env.ctx);
});

afterAll(async () => {
  if (env) await env.close();
});

describe('старт и снимок тренировки', () => {
  it('создаёт сессию, подходы и открытый интервал', async () => {
    const session = await startWorkout(user.accessToken);
    expect(session.status).toBe('active');
    expect(session.type).toBe('Full Body');
    expect(session.volume).toBe('Стандартная');
    expect(session.readOnly).toBe(false);
    expect(session.owningDeviceId).toBe(user.deviceId);
    expect(session.revision).toBe(1);
    expect(session.exercises).toHaveLength(2);
    expect(session.exercises[0]!.sets).toHaveLength(3);
    expect(session.exercises[1]!.sets).toHaveLength(4);
    expect(session.intervals).toHaveLength(1);
    expect(session.intervals[0]!.endedAt).toBeNull();
  });

  it('отклоняет упражнение вне каталога', async () => {
    const res = await api(env.app, 'POST', '/api/v1/workouts', {
      token: user.accessToken,
      body: {
        type: 'Full Body',
        volume: 'Стандартная',
        exercises: [{ name: 'Упражнение-призрак', position: 1, defaultSets: 3 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_exercise');
  });

  it('показывает активную тренировку в списке', async () => {
    const session = await startWorkout(user.accessToken);
    const active = await api(env.app, 'GET', '/api/v1/workouts/active', {
      token: user.accessToken,
    });
    expect(active.body.active).toHaveLength(1);
    expect(active.body.active[0]).toMatchObject({ id: session.id, readOnly: false });
  });
});

describe('пачка операций', () => {
  it('применяет подходы, закрывает интервал и завершает тренировку', async () => {
    const session = await startWorkout(user.accessToken);
    const [first, second] = session.exercises;

    const fill = await postOps(user.accessToken, session.id, session.revision, [
      {
        type: 'set_upsert',
        operationId: uuid(),
        payload: {
          sessionExerciseId: first!.id,
          setNumber: 1,
          weight: 60,
          reps: 8,
          completedAt: nowIso(),
        },
      },
      {
        type: 'set_upsert',
        operationId: uuid(),
        payload: { sessionExerciseId: first!.id, setNumber: 2, weight: 65, reps: 6 },
      },
      {
        type: 'set_upsert',
        operationId: uuid(),
        payload: { sessionExerciseId: second!.id, setNumber: 1, weight: 30, reps: 12 },
      },
      {
        type: 'exercise_status',
        operationId: uuid(),
        payload: { sessionExerciseId: first!.id, status: 'completed' },
      },
      { type: 'interval_close', operationId: uuid(), payload: {} },
    ]);
    expect(fill.status).toBe(200);
    expect(fill.body.result.applied).toHaveLength(5);
    expect(fill.body.result.rejected).toHaveLength(0);
    expect(fill.body.result.revision).toBe(2);
    expect(fill.body.result.sessionStatus).toBe('active');

    const snapshot = fill.body.session as Snapshot;
    expect(snapshot.countedExercises).toBe(1);
    expect(Number(snapshot.exercises[0]!.sets[0]!.weight)).toBe(60);
    expect(snapshot.exercises[0]!.sets[0]!.reps).toBe(8);
    expect(snapshot.exercises[0]!.sets[0]!.completedAt).toBeTruthy();
    expect(snapshot.intervals[0]!.endedAt).toBeTruthy();

    const finish = await postOps(user.accessToken, session.id, fill.body.result.revision, [
      { type: 'finish', operationId: uuid(), payload: { completedAt: nowIso() } },
    ]);
    expect(finish.body.result.sessionStatus).toBe('completed');
    expect(finish.body.session.status).toBe('completed');
    expect(finish.body.session.completedAt).toBeTruthy();
  });

  it('не засчитывает тренировку без выполненных упражнений', async () => {
    const session = await startWorkout(user.accessToken);
    const res = await postOps(user.accessToken, session.id, session.revision, [
      { type: 'finish', operationId: uuid(), payload: {} },
    ]);
    expect(res.body.result.rejected).toHaveLength(1);
    expect(res.body.result.rejected[0].code).toBe('operation_rejected');
    expect(res.body.session.status).toBe('active');
  });

  it('идемпотентна: повтор operationId не применяется дважды', async () => {
    const session = await startWorkout(user.accessToken);
    const operationId = uuid();
    const ops = [
      {
        type: 'set_upsert',
        operationId,
        payload: { sessionExerciseId: session.exercises[0]!.id, setNumber: 1, weight: 40, reps: 10 },
      },
    ];

    const first = await postOps(user.accessToken, session.id, session.revision, ops);
    expect(first.body.result.applied).toEqual([operationId]);
    expect(first.body.result.revision).toBe(2);

    const second = await postOps(user.accessToken, session.id, first.body.result.revision, ops);
    expect(second.body.result.applied).toHaveLength(0);
    expect(second.body.result.skipped).toContain(operationId);
    expect(second.body.result.revision).toBe(2);
  });

  it('сообщает о конфликте revision и отдаёт актуальную версию', async () => {
    const session = await startWorkout(user.accessToken);
    const res = await postOps(user.accessToken, session.id, 999, [
      {
        type: 'set_upsert',
        operationId: uuid(),
        payload: { sessionExerciseId: session.exercises[0]!.id, setNumber: 1, weight: 50, reps: 5 },
      },
    ]);
    expect(res.body.result.conflict).toBe(true);
    expect(res.body.result.revision).toBe(session.revision);
    expect(res.body.result.applied).toHaveLength(0);
  });
});

describe('владение активной тренировкой', () => {
  it('чужое устройство не может писать, но может забрать владение', async () => {
    const session = await startWorkout(user.accessToken);
    const second = await loginOnDevice(env.app, user.email, user.password, 'second-device');
    const setOp = (rev: number) =>
      postOps(second.accessToken, session.id, rev, [
        {
          type: 'set_upsert',
          operationId: uuid(),
          payload: {
            sessionExerciseId: session.exercises[0]!.id,
            setNumber: 1,
            weight: 55,
            reps: 7,
          },
        },
      ]);

    const blocked = await setOp(session.revision);
    expect(blocked.body.result.rejected[0].code).toBe('ownership_required');

    const transfer = await postOps(second.accessToken, session.id, session.revision, [
      { type: 'transfer_ownership', operationId: uuid(), payload: {} },
    ]);
    expect(transfer.body.result.applied).toHaveLength(1);
    expect(transfer.body.result.owningDeviceId).toBe(second.deviceId);
    expect(transfer.body.session.readOnly).toBe(false);

    const allowed = await setOp(transfer.body.result.revision);
    expect(allowed.body.result.applied).toHaveLength(1);

    const strangerView = await api(env.app, 'GET', `/api/v1/workouts/${session.id}`, {
      token: user.accessToken,
    });
    expect(strangerView.body.session.readOnly).toBe(true);
  });
});

describe('удаление тренировки', () => {
  it('удаляет активную и запрещает удалять завершённую', async () => {
    const session = await startWorkout(user.accessToken);
    const del = await api(env.app, 'DELETE', `/api/v1/workouts/${session.id}`, {
      token: user.accessToken,
    });
    expect(del.status).toBe(204);
    const active = await api(env.app, 'GET', '/api/v1/workouts/active', {
      token: user.accessToken,
    });
    expect(active.body.active).toHaveLength(0);

    const completed = await startWorkout(user.accessToken);
    await postOps(user.accessToken, completed.id, completed.revision, [
      {
        type: 'exercise_status',
        operationId: uuid(),
        payload: { sessionExerciseId: completed.exercises[0]!.id, status: 'completed' },
      },
    ]);
    const finish = await postOps(user.accessToken, completed.id, 2, [
      { type: 'finish', operationId: uuid(), payload: {} },
    ]);
    expect(finish.body.session.status).toBe('completed');

    const refuse = await api(env.app, 'DELETE', `/api/v1/workouts/${completed.id}`, {
      token: user.accessToken,
    });
    expect(refuse.status).toBe(409);
  });
});


describe('регрессии очереди без интернета', () => {
  it('добавляет подход, заполняет его и завершает тренировку одним пакетом', async () => {
    const session = await startWorkout(user.accessToken);
    const exId = session.exercises[0]!.id;
    const ops = [
      { type: 'set_add', operationId: uuid(), payload: { sessionExerciseId: exId, setNumber: 4 } },
      { type: 'set_upsert', operationId: uuid(), payload: { sessionExerciseId: exId, setNumber: 4, weight: 60, reps: 8, completedAt: nowIso() } },
      { type: 'exercise_status', operationId: uuid(), payload: { sessionExerciseId: exId, status: 'completed' } },
      { type: 'finish', operationId: uuid(), payload: {} },
    ];
    const res = await postOps(user.accessToken, session.id, 1, ops);
    expect(res.status).toBe(200);
    expect(res.body.result.applied).toHaveLength(4);
    expect(res.body.result.rejected).toEqual([]);
    expect(res.body.session.status).toBe('completed');
    expect(Number(res.body.session.exercises[0].sets[3].weight)).toBe(60);
    // Response may be lost: a replay with the original revision must succeed.
    const retry = await postOps(user.accessToken, session.id, 1, ops);
    expect(retry.body.result.conflict).toBe(false);
    expect(retry.body.result.skipped).toHaveLength(4);
    expect(retry.body.result.revision).toBe(2);
  });

  it('меняет порядок и продолжает после отклонённой операции', async () => {
    const session = await startWorkout(user.accessToken);
    const res = await postOps(user.accessToken, session.id, 1, [
      { type: 'exercise_position', operationId: uuid(), payload: { sessionExerciseId: session.exercises[0]!.id, position: 2 } },
      { type: 'finish', operationId: uuid(), payload: { completedAt: nowIso() } },
      { type: 'set_upsert', operationId: uuid(), payload: { sessionExerciseId: session.exercises[0]!.id, setNumber: 1, weight: 40, reps: 5 } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.result.applied).toHaveLength(2);
    expect(res.body.result.rejected).toHaveLength(1);
    expect(res.body.session.exercises[1].id).toBe(session.exercises[0]!.id);
    expect(Number(res.body.session.exercises[1].sets[0].weight)).toBe(40);
  });

  it('дедуплицирует операции внутри пакета и запрещает подмену payload', async () => {
    const session = await startWorkout(user.accessToken);
    const op = { type: 'interval_open', operationId: uuid(), payload: {} };
    const res = await postOps(user.accessToken, session.id, 1, [op, op]);
    expect(res.status).toBe(200);
    expect(res.body.result.applied).toHaveLength(1);
    expect(res.body.session.intervals).toHaveLength(1);
    const misuse = await postOps(user.accessToken, session.id, 2, [{ ...op, type: 'interval_close' }]);
    expect(misuse.status).toBe(409);
  });

  it('передаёт владение и принимает изменения от нового устройства в одном пакете', async () => {
    const session = await startWorkout(user.accessToken);
    const second = await loginOnDevice(env.app, user.email, user.password, 'transfer-batch');
    const res = await postOps(second.accessToken, session.id, 1, [
      { type: 'transfer_ownership', operationId: uuid(), payload: {} },
      { type: 'set_upsert', operationId: uuid(), payload: { sessionExerciseId: session.exercises[0]!.id, setNumber: 1, weight: 35, reps: 8 } },
    ]);
    expect(res.body.result.applied).toHaveLength(2);
    expect(res.body.result.rejected).toEqual([]);
    const revoked = await api(env.app, 'DELETE', `/api/v1/auth/devices/${second.deviceId}`, { token: user.accessToken });
    expect(revoked.status).toBe(204);
    expect((await api(env.app, 'GET', `/api/v1/workouts/${session.id}`, { token: user.accessToken })).status).toBe(200);
    expect((await api(env.app, 'GET', '/api/v1/account', { token: second.accessToken })).status).toBe(401);
  });
});

it('выдаёт историю страницами и разрешает исправлять её с другого устройства', async () => {
  const completed: string[] = [];
  for (let i = 0; i < 2; i++) {
    const session = await startWorkout(user.accessToken);
    const res = await postOps(user.accessToken, session.id, 1, [
      { type: 'exercise_status', operationId: uuid(), payload: { sessionExerciseId: session.exercises[0]!.id, status: 'completed' } },
      { type: 'finish', operationId: uuid(), payload: {} },
    ]);
    expect(res.body.session.status).toBe('completed');
    completed.push(session.id);
  }
  const first = await api(env.app, 'GET', '/api/v1/workouts?limit=1', { token: user.accessToken });
  expect(first.status).toBe(200);
  expect(first.body.history).toHaveLength(1);
  expect(first.body.nextCursor).toBeTypeOf('string');
  const next = await api(env.app, 'GET', `/api/v1/workouts?limit=1&cursor=${first.body.nextCursor}`, { token: user.accessToken });
  expect(next.status).toBe(200);
  expect(new Set([first.body.history[0].id, next.body.history[0].id])).toEqual(new Set(completed));
  expect(next.body.nextCursor).toBeNull();
  const second = await loginOnDevice(env.app, user.email, user.password, 'history-editor');
  const patch = await api(env.app, 'PATCH', `/api/v1/workouts/${completed[0]}`, {
    token: second.accessToken,
    body: { expectedRevision: 2, startedAt: new Date(Date.now() - 86400000).toISOString() },
  });
  expect(patch.status).toBe(200);
  const stale = await api(env.app, 'PATCH', `/api/v1/workouts/${completed[0]}`, {
    token: second.accessToken, body: { expectedRevision: 2, completedAt: null },
  });
  expect(stale.status).toBe(409);
});

it('откатывает побочные изменения отклонённой операции и сохраняет следующие', async () => {
  const session = await startWorkout(user.accessToken);
  const res = await postOps(user.accessToken, session.id, 1, [
    { type: 'exercise_status', operationId: uuid(), payload: { sessionExerciseId: session.exercises[0]!.id, status: 'completed' } },
    // finish closes the interval before checking its date: savepoint must undo it.
    { type: 'finish', operationId: uuid(), payload: { completedAt: new Date(Date.parse(session.startedAt) - 1000).toISOString() } },
    { type: 'set_upsert', operationId: uuid(), payload: { sessionExerciseId: session.exercises[0]!.id, setNumber: 1, weight: 25, reps: 8 } },
  ]);
  expect(res.status).toBe(200);
  expect(res.body.result.applied).toHaveLength(2);
  expect(res.body.result.rejected).toHaveLength(1);
  expect(res.body.session.status).toBe('active');
  expect(res.body.session.intervals[0].endedAt).toBeNull();
});
