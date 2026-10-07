import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog } from '@gymix/catalog';
import { loadReference } from '../src/reference.js';
import { seed, type Db } from '../src/seed.js';
import {
  anatomicalTags,
  devices,
  equipment,
  equipmentAliases,
  exerciseAnatomicalTags,
  exerciseEquipment,
  exerciseMovementPatterns,
  exerciseMuscles,
  exercises,
  movementPatterns,
  muscleGroups,
  sessionExercises,
  sessionIntervals,
  sessionSets,
  syncOperations,
  userExcludedExercises,
  users,
  workoutSessions,
  workoutTemplates,
  workoutTypes,
  workoutVolumes,
} from '../src/schema.js';

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

let db: Db & PgliteDatabase;

async function count(table: PgTable): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return rows[0]?.n ?? -1;
}

async function raw(query: ReturnType<typeof sql>): Promise<readonly Record<string, unknown>[]> {
  // Интерсекция типов Db & PgliteDatabase обнуляет результат execute.
  const result = (await db.execute(query)) as unknown as {
    rows: readonly Record<string, unknown>[];
  };
  return result.rows;
}

/** Нарушение уникальности PGlite прячется под DrizzleQueryError в cause. */
async function expectUniqueViolation(promise: Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'ожидалось нарушение уникальности').toBeDefined();
  const cause = (caught as { cause?: unknown }).cause;
  const text = [String(caught), cause instanceof Error ? cause.message : ''].join(' ');
  expect(text).toMatch(/duplicate key|unique constraint/i);
}

async function makeUser(email: string): Promise<{ userId: string; deviceId: string }> {
  const [user] = await db.insert(users).values({ email, passwordHash: 'argon2id$fake' }).returning();
  const [device] = await db
    .insert(devices)
    .values({ userId: user!.id, label: 'телефон' })
    .returning();
  return { userId: user!.id, deviceId: device!.id };
}

beforeAll(async () => {
  db = drizzle(new PGlite()) as Db & PgliteDatabase;
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await seed(db);
});

describe('референсные справочники', () => {
  it('загружает 10 групп мышц и 1 анатомический тег', async () => {
    expect(await count(muscleGroups)).toBe(10);
    expect(await count(anatomicalTags)).toBe(1);
  });

  it('загружает ровно 23 паттерна движения', async () => {
    expect(await count(movementPatterns)).toBe(23);
    expect(await count(movementPatterns)).toBe(loadReference().movementPatterns.length);
  });

  it('загружает 50 типов оборудования и таблицу алиасов', async () => {
    expect(await count(equipment)).toBe(50);
    // 21 лейбл в таблице: «Собственный вес» и «—» не дают строк (пустое
    // оборудование), «Медбол / Диск» даёт две → 20 связей.
    expect(loadReference().equipmentAliases.size).toBe(21);
    expect(await count(equipmentAliases)).toBe(20);
  });

  it('разворачивает 7 типов и 3 объёма тренировки', async () => {
    expect(await count(workoutTypes)).toBe(7);
    expect(await count(workoutVolumes)).toBe(3);
  });
});

describe('канонический каталог в БД', () => {
  it('содержит все 113 упражнений', async () => {
    expect(await count(exercises)).toBe(113);
    expect(await count(exercises)).toBe(loadCatalog().exercises.length);
  });

  it('связывает 198 строк мышц: 134 primary и 64 secondary', async () => {
    const total = await count(exerciseMuscles);
    const primary = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(exerciseMuscles)
      .where(sql`role = 'primary'`);
    expect(total).toBe(198);
    expect(primary[0]?.n).toBe(134);
  });

  it('связывает 114 строк паттернов', async () => {
    expect(await count(exerciseMovementPatterns)).toBe(114);
  });

  it('помечает 11 упражнений «Пресс» и 3 с тегом rear_delt', async () => {
    const press = await raw(sql`
      select count(*)::int as n
      from ${sql.identifier(getTableConfig(exerciseMuscles).name)} m
      join ${sql.identifier(getTableConfig(muscleGroups).name)} g on g.id = m.muscle_group_id
      where m.role = 'primary' and g.name = 'Пресс'`);
    expect(press[0]?.['n']).toBe(11);
    expect(await count(exerciseAnatomicalTags)).toBe(3);
  });

  it('разрешает каждую метку оборудования в канонический тип', async () => {
    const catalog = loadCatalog();
    const labels = [...new Set(catalog.exercises.flatMap((e) => e.equipment))];
    expect(labels.length).toBe(42);
    // Seed падает, если лейбл не разрешается; здесь проверяем результат:
    // без оборудования остаются только записи с пустыми метками.
    const empty = await raw(sql`
      select e.canonical_name_ru as name
      from ${sql.identifier(getTableConfig(exercises).name)} e
      where not exists (
        select 1 from ${sql.identifier(getTableConfig(exerciseEquipment).name)} x
        where x.exercise_id = e.id
      )`);
    expect(empty.length).toBeGreaterThan(0);
    for (const row of empty) {
      const name = String(row['name']);
      const exercise = catalog.exercises.find((e) => e.name === name);
      expect(exercise, name).toBeDefined();
      expect(
        exercise!.equipment.every((l) => l === 'Собственный вес' || l === '—'),
        `${name}: ${exercise!.equipment.join(', ')}`,
      ).toBe(true);
    }
  });
});

describe('ограничения и целостность', () => {
  it('не принимает два аккаунта с одинаковым email', async () => {
    await makeUser('unique@example.com');
    await expectUniqueViolation(makeUser('unique@example.com'));
  });

  it('каскадно удаляет данные пользователя, оставляя каталог', async () => {
    const { userId, deviceId } = await makeUser('cascade@example.com');
    const typeId = (await db.select().from(workoutTypes))[0]!.id;
    const volumeId = (await db.select().from(workoutVolumes))[0]!.id;
    const [template] = await db
      .insert(workoutTemplates)
      .values({ userId, title: 'Тест', typeId, volumeId })
      .returning();
    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId,
        typeId,
        volumeId,
        owningDeviceId: deviceId,
        sourceTemplateId: template!.id,
      })
      .returning();
    const firstExercise = await db.select({ id: exercises.id }).from(exercises).limit(1);
    const [sessionExercise] = await db
      .insert(sessionExercises)
      .values({
        sessionId: session!.id,
        exerciseId: firstExercise[0]!.id,
        exerciseNameSnapshot: 'Название',
        position: 1,
      })
      .returning();
    await db.insert(sessionSets).values({ sessionExerciseId: sessionExercise!.id, setNumber: 1 });
    await db.insert(userExcludedExercises).values({ userId, exerciseId: firstExercise[0]!.id });
    await db.insert(syncOperations).values({
      operationId: crypto.randomUUID(),
      userId,
      deviceId,
      payload: {},
    });

    await db.delete(users).where(sql`id = ${userId}::uuid`);

    expect(
      await raw(sql`select 1 from ${sql.identifier(getTableConfig(workoutSessions).name)} where user_id = ${userId}::uuid`),
    ).toHaveLength(0);
    expect(
      await raw(sql`select 1 from ${sql.identifier(getTableConfig(workoutTemplates).name)} where user_id = ${userId}::uuid`),
    ).toHaveLength(0);
    expect(
      await raw(sql`select 1 from ${sql.identifier(getTableConfig(devices).name)} where user_id = ${userId}::uuid`),
    ).toHaveLength(0);
    expect(
      await raw(sql`select 1 from ${sql.identifier(getTableConfig(userExcludedExercises).name)} where user_id = ${userId}::uuid`),
    ).toHaveLength(0);
    expect(
      await raw(sql`select 1 from ${sql.identifier(getTableConfig(syncOperations).name)} where user_id = ${userId}::uuid`),
    ).toHaveLength(0);
    expect(
      await raw(sql`
        select 1 from ${sql.identifier(getTableConfig(sessionExercises).name)} se
        join ${sql.identifier(getTableConfig(workoutSessions).name)} ws on ws.id = se.session_id
        where ws.user_id = ${userId}::uuid`),
    ).toHaveLength(0);
    expect(
      await raw(sql`
        select 1 from ${sql.identifier(getTableConfig(sessionSets).name)} s
        join ${sql.identifier(getTableConfig(sessionExercises).name)} se on se.id = s.session_exercise_id
        join ${sql.identifier(getTableConfig(workoutSessions).name)} ws on ws.id = se.session_id
        where ws.user_id = ${userId}::uuid`),
    ).toHaveLength(0);
    // Каталог — референсные данные, он не зависит от пользователя.
    expect(await count(exercises)).toBe(113);
  });

  it('хранит операции синхронизации идемпотентно по (user, operation)', async () => {
    const { userId, deviceId } = await makeUser('sync@example.com');
    const operationId = crypto.randomUUID();
    await db.insert(syncOperations).values({ operationId, userId, deviceId, payload: { a: 1 } });
    await expectUniqueViolation(
      db.insert(syncOperations).values({ operationId, userId, deviceId, payload: { a: 1 } }),
    );
  });

  it('разрешает только один открытый интервал таймера на сессию', async () => {
    const { userId, deviceId } = await makeUser('timer@example.com');
    const typeId = (await db.select().from(workoutTypes))[0]!.id;
    const volumeId = (await db.select().from(workoutVolumes))[0]!.id;
    const [session] = await db
      .insert(workoutSessions)
      .values({ userId, typeId, volumeId, owningDeviceId: deviceId })
      .returning();
    await db.insert(sessionIntervals).values({ sessionId: session!.id });
    await expectUniqueViolation(db.insert(sessionIntervals).values({ sessionId: session!.id }));
  });
});
