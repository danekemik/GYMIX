import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  catalog,
  createTestEnv,
  firstExerciseName,
  registerUser,
  secondExerciseName,
  type RegisteredUser,
  type TestEnv,
} from './helpers.js';

let env: TestEnv;
let user: RegisteredUser;

const exA = firstExerciseName;
const exB = secondExerciseName;
const otherExerciseName = catalog.exercises[2]?.name ?? exB;

const entry = (name: string, position: number, defaultSets = 4) => ({
  exerciseName: name,
  slotKey: `slot-${position}`,
  position,
  defaultSets,
});

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
  user = await registerUser(env.app, env.ctx);
});

afterAll(async () => {
  if (env) await env.close();
});

describe('шаблоны тренировок', () => {
  it('создаёт шаблон и раскрывает имена упражнений каталогом', async () => {
    const res = await api(env.app, 'POST', '/api/v1/templates', {
      token: user.accessToken,
      body: {
        title: 'Сплит на грудь',
        type: 'Full Body',
        volume: 'Стандартная',
        entries: [entry(exA, 1), entry(exB, 2)],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.template.entries.map((e: { exerciseName: string }) => e.exerciseName)).toEqual([
      exA,
      exB,
    ]);
    expect(res.body.template.entries[0].exerciseId).toBeTypeOf('string');
  });

  it('не принимает упражнение вне каталога', async () => {
    const res = await api(env.app, 'POST', '/api/v1/templates', {
      token: user.accessToken,
      body: {
        title: 'Плохой',
        type: 'Full Body',
        volume: 'Компактная',
        entries: [entry('Выдуманное упражнение', 1)],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_exercise');
  });

  it('переименование, полная замена состава и копия', async () => {
    const created = await api(env.app, 'POST', '/api/v1/templates', {
      token: user.accessToken,
      body: {
        title: 'База',
        type: 'Upper Body',
        volume: 'Расширенная',
        entries: [entry(exA, 1)],
      },
    });
    const templateId = created.body.template.id as string;

    const renamed = await api(env.app, 'PATCH', `/api/v1/templates/${templateId}`, {
      token: user.accessToken,
      body: { title: 'База 2.0' },
    });
    expect(renamed.body.template.title).toBe('База 2.0');

    const replaced = await api(env.app, 'PUT', `/api/v1/templates/${templateId}`, {
      token: user.accessToken,
      body: { entries: [entry(exB, 1, 3), entry(otherExerciseName, 2, 5)] },
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.template.entries).toHaveLength(2);
    expect(replaced.body.template.entries[1].defaultSets).toBe(5);

    const copy = await api(env.app, 'POST', `/api/v1/templates/${templateId}/copy`, {
      token: user.accessToken,
    });
    expect(copy.status).toBe(201);
    expect(copy.body.template.title).toBe('База 2.0 (копия)');
    expect(copy.body.template.entries).toHaveLength(2);

    const list = await api(env.app, 'GET', '/api/v1/templates', { token: user.accessToken });
    expect(list.body.templates).toHaveLength(2);
  });

  it('удаляет шаблон', async () => {
    const created = await api(env.app, 'POST', '/api/v1/templates', {
      token: user.accessToken,
      body: {
        title: 'Временный',
        type: 'Legs',
        volume: 'Компактная',
        entries: [entry(exA, 1)],
      },
    });
    const del = await api(
      env.app,
      'DELETE',
      `/api/v1/templates/${created.body.template.id}`,
      { token: user.accessToken },
    );
    expect(del.status).toBe(204);

    const list = await api(env.app, 'GET', '/api/v1/templates', { token: user.accessToken });
    expect(list.body.templates).toHaveLength(0);
  });

  it('не показывает шаблоны другого пользователя', async () => {
    await api(env.app, 'POST', '/api/v1/templates', {
      token: user.accessToken,
      body: {
        title: 'Мой',
        type: 'Full Body',
        volume: 'Стандартная',
        entries: [entry(exA, 1)],
      },
    });

    const other = await registerUser(env.app, env.ctx, 'neighbor@example.com');
    const list = await api(env.app, 'GET', '/api/v1/templates', { token: other.accessToken });
    expect(list.body.templates).toHaveLength(0);
  });
});

describe('исключённые упражнения', () => {
  it('заменяет набор исключений целиком', async () => {
    const empty = await api(env.app, 'GET', '/api/v1/exclusions', { token: user.accessToken });
    expect(empty.body.excluded).toHaveLength(0);

    const set = await api(env.app, 'PUT', '/api/v1/exclusions', {
      token: user.accessToken,
      body: { excludedNames: [exA, exB] },
    });
    expect(set.status).toBe(200);
    expect(set.body.excluded.map((e: { name: string }) => e.name).sort()).toEqual(
      [exA, exB].sort(),
    );

    const replace = await api(env.app, 'PUT', '/api/v1/exclusions', {
      token: user.accessToken,
      body: { excludedNames: [exB] },
    });
    expect(replace.body.excluded.map((e: { name: string }) => e.name)).toEqual([exB]);
  });

  it('отклоняет незнакомое упражнение', async () => {
    const res = await api(env.app, 'PUT', '/api/v1/exclusions', {
      token: user.accessToken,
      body: { excludedNames: ['Нет такого'] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_exercise');
  });
});
