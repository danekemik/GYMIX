import { serveReadModels } from '../src/data/local/read-server';
import { attachReadClient, closeReadClient, createReadClient } from '../src/data/local/read-rpc';
import { cacheFor } from '../src/data/local/read-cache';
import { weeklyActivity } from '../src/lib/weeklyActivity';
import { previousWorkingSets, workoutFromHistory } from '../src/lib/reuseWorkout';
import { loadRecord, saveRecord } from '../src/lib/record';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { seed } from '@gymix/db';
import { users, devices, workoutSessions } from '@gymix/db/schema';
import { entityKeys, readEntity, writeEntity } from '@gymix/db/sync-data';
import { generateWorkout } from '@gymix/generator';
import { loadCatalog } from '@gymix/catalog';
import type { SyncReply, SyncSnapshot } from '@gymix/contracts';
import type { GymixDb } from '../src/lib/db';
import { initializeSyncStore, localChange, nextChange, queueEntries, rows } from '../src/data/sync/store';
import { synchronize, resolveConflict, type SyncTransport } from '../src/data/sync/engine';
import { createDraft, persistDraft, finishDraft, deleteDraft, setDraftRunning } from '../src/lib/session';
import { saveTemplate, deleteTemplate } from '../src/lib/templates';
import { excludeExerciseByName, includeExerciseByName } from '../src/lib/exclusions';
import { progressSeries, saveBodyWeight } from '../src/lib/progress';
import { api, createTestEnv, registerUser, loginOnDevice, type TestEnv, type RegisteredUser } from '../../server/test/helpers';
let env: TestEnv;
const closes: Array<() => Promise<void>> = [];
beforeAll(async () => { env = await createTestEnv(); }, 30000);
afterAll(async () => { await Promise.all(closes.map(close => close())); await env.close(); });
async function local(user: RegisteredUser, deviceId = user.deviceId): Promise<GymixDb> {
  const { userId } = await env.ctx.tokens.verifyAccess(user.accessToken);
  const pg = new PGlite(); closes.push(() => pg.close());
  const db = drizzle(pg);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url)) });
  await seed(db); await initializeSyncStore(db);
  await db.insert(users).values({ id: userId, email: user.email, passwordHash: 'local-only' });
  await db.insert(devices).values({ id: deviceId, userId, label: 'test' });
  return { db, pglite: pg, account: { userId, email: user.email, deviceId }, counts: { exercises: 113, muscleGroups: 10 } } as unknown as GymixDb;
}
function transport(token: string): SyncTransport {
  return async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await api(env.app, body === undefined ? 'GET' : 'POST', `/api/v1${path}`, { token, ...(body === undefined ? {} : { body }) });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.body)}`);
    return response.body as T;
  };
}
const workout = () => generateWorkout(loadCatalog(), { type: 'Push', volume: 'Компактная', seed: 123 });

it('worker commands commit the session, outbox and home snapshot together', async () => {
  const user = await registerUser(env.app, env.ctx);
  const source = await local(user);
  const stop = serveReadModels(source.pglite, source.account.userId);
  const client = { ...source };
  const reader = createReadClient(source.account);
  attachReadClient(client, reader);
  try {
    await reader.initialize();
    const plan = workout();
    const draft = await createDraft(client, plan);
    expect(draft.byPosition).toBeInstanceOf(Map);
    const cache = cacheFor(client);
    expect(cache.entry<{ sessionId: string }>('active', async () => ({ sessionId: '' })).snapshot.data?.sessionId).toBe(draft.sessionId);
    const sets = plan.entries.map((_, ex) => Array.from({ length: 3 }, (_, index) => ({ weight: '42,5', reps: '8', done: ex === 0 || (ex === 1 && index === 0) })));
    await persistDraft(client, draft.sessionId, draft.byPosition, sets);
    const extra = sets.map((group, index) => index === 0 ? [...group, { weight: '35', reps: '10', done: false }] : group);
    await persistDraft(client, draft.sessionId, draft.byPosition, extra);
    await persistDraft(client, draft.sessionId, draft.byPosition, sets);
    const trimmed = await reader.query(`resume:${draft.sessionId}`) as { sets: unknown[][] };
    expect(trimmed.sets[0]).toHaveLength(3);
    const invalid = sets.map((group, index) => index === 0 ? [{ weight: '-5', reps: '8abc', done: true }, ...group.slice(1)] : group);
    await expect(persistDraft(client, draft.sessionId, draft.byPosition, invalid)).rejects.toThrow('Проверь вес');
    const at = Date.now();
    await setDraftRunning(client, draft.sessionId, false, at);
    const resumed = await reader.query(`resume:${draft.sessionId}`) as { running: boolean; sets: unknown[][] };
    expect(resumed.running).toBe(false);
    expect(resumed.sets[0]?.[0]).toEqual({ weight: '42.5', reps: '8', done: true });
    await finishDraft(client, draft, { workout: plan, sets, startedAt: at - 1000, endedAt: at, durationMs: 1000 });
    const partial = await loadRecord(source, draft.sessionId);
    expect(partial.exercises[1]?.partial).toBe(true);
    expect(partial.exercises[1]?.sets.filter(set => set.done)).toHaveLength(1);
    expect((await progressSeries(source)).map(series => series.name)).toEqual([plan.entries[0]!.exercise.name]);
    await saveRecord(client, draft.sessionId, { baseRevision: partial.revision, startedAt: partial.startedAt, completedAt: partial.completedAt,
      exercises: partial.exercises.map(exercise => ({ id: exercise.id, status: exercise.status, sets: exercise.sets })) });
    expect((await loadRecord(source, draft.sessionId)).exercises[1]?.partial).toBe(true);
    expect(cache.entry('active', async () => null).snapshot.data).toBeNull();
    expect((await reader.query('history') as { id: string }[])[0]?.id).toBe(draft.sessionId);
    expect(await queueEntries(source.db)).toHaveLength(1);
    await synchronize(client, transport(user.accessToken));
    expect(await queueEntries(source.db)).toHaveLength(0);
    const templateId = await saveTemplate(client, { title: 'План', type: plan.type, volume: plan.volume, entries: plan.entries.map(entry => ({ slotKey: entry.slotKey, exerciseName: entry.exercise.name })) });
    expect((await reader.query('templates') as { id: string }[]).some(template => template.id === templateId)).toBe(true);
    await excludeExerciseByName(client, plan.entries[0]!.exercise.name);
    expect((await reader.query('exclusions') as { name: string }[]).some(exercise => exercise.name === plan.entries[0]!.exercise.name)).toBe(true);
    await includeExerciseByName(client, plan.entries[0]!.exercise.name);
    expect(await reader.query('exclusions')).toEqual([]);
    const next = await createDraft(client, plan);
    expect(next.sessionId).not.toBe(draft.sessionId);
    await deleteDraft(client, next.sessionId);
    expect(await reader.query('active')).toBeNull();
  } finally { closeReadClient(client); stop(); }
}, 30000);

it('полная тренировка без сети сохраняется в очереди и появляется на другом устройстве', async () => {
  const user = await registerUser(env.app, env.ctx);
  const first = await local(user);
  const plan = workout();
  const draft = await createDraft(first, plan);
  expect((await weeklyActivity(first)).count).toBe(0);
  const sets = plan.entries.map(() => Array.from({ length: 3 }, () => ({ weight: '40', reps: '8', done: true })));
  await persistDraft(first, draft.sessionId, draft.byPosition, sets);
  await finishDraft(first, draft, { workout: plan, sets, startedAt: Date.now() - 1000, endedAt: Date.now(), durationMs: 1000 });
  expect((await weeklyActivity(first)).count).toBe(1);
  expect((await weeklyActivity({ ...first, account: { ...first.account, userId: crypto.randomUUID() } })).count).toBe(0);
  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
  expect((await weeklyActivity(first, nextMonth)).count).toBe(0);
  expect(await queueEntries(first.db)).toHaveLength(1);
  const restarted = { ...first }; // another engine instance reads the persisted queue
  await synchronize(restarted, transport(user.accessToken));
  expect(await queueEntries(first.db)).toHaveLength(0);
  const secondLogin = await loginOnDevice(env.app, user.email, user.password, 'integration-second');
  const second = await local(user, secondLogin.deviceId);
  await synchronize(second, transport(secondLogin.accessToken));
  const record = await readEntity(second.db, second.account.userId, `workout:${draft.sessionId}`);
  expect(record?.kind).toBe('workout');
  if (record?.kind !== 'workout') throw new Error('missing');
  expect(record.status).toBe('completed'); expect(record.exercises[0]!.sets[0]!.weight).toBe('40');
  const history = await loadRecord(second, draft.sessionId);
  const patch = {
    baseRevision: history.revision, startedAt: history.startedAt, completedAt: history.completedAt,
    exercises: history.exercises.map(e => ({ ...e, sets: e.sets.map(set => ({ ...set, weight: '42' })) }))
  };
  await saveRecord(second, draft.sessionId, patch);
  await expect(saveRecord(second, draft.sessionId, patch)).rejects.toThrow('Запись обновилась');
  await synchronize(second, transport(secondLogin.accessToken));
  await synchronize(first, transport(user.accessToken));
  const updated = await readEntity(first.db, first.account.userId, `workout:${draft.sessionId}`);
  expect(updated?.kind === 'workout' && updated.exercises[0]!.sets[0]!.weight).toBe('42');
  const repeated = await workoutFromHistory(first, draft.sessionId);
  expect(repeated.entries.map(e => e.exercise.name)).toEqual(plan.entries.map(e => e.exercise.name));
  const suggestions = await previousWorkingSets(first, repeated.entries.map(e => e.exercise.name));
  expect(suggestions.get(repeated.entries[0]!.exercise.name)?.[0]).toEqual({ weight: '42', reps: '8', done: false });
  expect((await readEntity(first.db, first.account.userId, `workout:${draft.sessionId}`))?.kind === 'workout').toBe(true);
  const stopReads = serveReadModels(first.pglite, first.account.userId);
  const reader = createReadClient(first.account);
  try {
    expect((await reader.initialize()).exercises).toBeGreaterThan(100);
    const history = await reader.query('history') as { completedAt: Date; id: string; }[];
    expect(history[0]?.id).toBe(draft.sessionId);
    expect(history[0]?.completedAt).toBeInstanceOf(Date);
    expect(await reader.query('active')).toBeNull();
    const loadedRecord = await reader.query(`record:${draft.sessionId}`) as { startedAt: Date; exercises: unknown[]; };
    expect(loadedRecord.startedAt).toBeInstanceOf(Date);
    expect(loadedRecord.exercises).toHaveLength(plan.entries.length);
    expect((await reader.query(`repeat:${draft.sessionId}`) as { entries: unknown[]; }).entries).toHaveLength(plan.entries.length);
    const past = await reader.query('previous', { names: [plan.entries[0]!.exercise.name] }) as Map<string, unknown>;
    expect(past).toBeInstanceOf(Map); expect(past.has(plan.entries[0]!.exercise.name)).toBe(true);
    const active = await createDraft(first, plan);
    const resumed = await reader.query(`resume:${active.sessionId}`) as { sessionId: string; byPosition: Map<number, string>; };
    expect(resumed.sessionId).toBe(active.sessionId);
    expect(resumed.byPosition).toBeInstanceOf(Map);


    expect((await reader.query('progress:all') as { series: unknown[]; }).series.length).toBeGreaterThan(0);
  } finally { reader.close(); stopReads(); }



}, 30000);

it('потерянный ответ повторяется с тем же ID и не создаёт дубликат', async () => {
  const user = await registerUser(env.app, env.ctx); const db = await local(user);
  await saveBodyWeight(db, '2026-10-16', 80);
  const normal = transport(user.accessToken);
  let lose = true;
  const request: SyncTransport = async <T>(path: string, body?: unknown) => {
    const result = await normal<T>(path, body);
    if (path === '/sync/change' && lose) { lose = false; throw new Error('reply lost'); }
    return result;
  };
  await expect(synchronize(db, request)).rejects.toThrow('reply lost');
  const [prepared] = await queueEntries(db.db); expect(prepared?.prepared).toBe(true);
  await saveBodyWeight(db, '2026-10-16', 79.5);
  expect((await queueEntries(db.db))[0]!.operationId).toBe(prepared!.operationId);
  await synchronize(db, normal);
  expect(await queueEntries(db.db)).toEqual([]);
  expect((await readEntity(env.db, db.account.userId, 'weight:2026-10-16'))).toEqual({ kind: 'weight', id: '2026-10-16', value: '79.5' });
}, 30000);

it('шаблоны, исключения, вес тела и удаления доходят до второго устройства', async () => {
  const user = await registerUser(env.app, env.ctx); const first = await local(user);
  const secondLogin = await loginOnDevice(env.app, user.email, user.password, 'data-second');
  const second = await local(user, secondLogin.deviceId);
  const plan = workout();
  const id = await saveTemplate(first, { title: 'План', type: plan.type, volume: plan.volume, entries: plan.entries.map(e => ({ slotKey: e.slotKey, exerciseName: e.exercise.name })) });
  await excludeExerciseByName(first, plan.entries[0]!.exercise.name); await saveBodyWeight(first, '2026-10-15', 78);
  await synchronize(first, transport(user.accessToken)); await synchronize(second, transport(secondLogin.accessToken));
  expect(await readEntity(second.db, second.account.userId, `template:${id}`)).not.toBeNull();
  expect(await readEntity(second.db, second.account.userId, 'exclusions:all')).not.toBeNull();
  expect(await readEntity(second.db, second.account.userId, 'weight:2026-10-15')).not.toBeNull();
  await deleteTemplate(first, id); await synchronize(first, transport(user.accessToken)); await synchronize(second, transport(secondLogin.accessToken));
  expect(await readEntity(second.db, second.account.userId, `template:${id}`)).toBeNull();
}, 30000);

it('сохраняет оба варианта конфликта и применяет локальный только по явному выбору', async () => {
  const user = await registerUser(env.app, env.ctx); const first = await local(user);
  const secondLogin = await loginOnDevice(env.app, user.email, user.password, 'conflict-second'); const second = await local(user, secondLogin.deviceId);
  const a = transport(user.accessToken), b = transport(secondLogin.accessToken);
  await saveBodyWeight(first, '2026-10-14', 80); await synchronize(first, a); await synchronize(second, b);
  await saveBodyWeight(first, '2026-10-14', 81); await saveBodyWeight(second, '2026-10-14', 79);
  await synchronize(first, a); await synchronize(second, b);
  expect((await queueEntries(second.db))[0]!.state).toBe('conflict');
  expect(await readEntity(second.db, second.account.userId, 'weight:2026-10-14')).toMatchObject({ value: '79' });
  await resolveConflict(second, 'weight:2026-10-14', 'local', b); await synchronize(second, b);
  expect(await readEntity(env.db, second.account.userId, 'weight:2026-10-14')).toMatchObject({ value: '79' });
  expect(await rows(second.db, sql`SELECT * FROM local_recovery`)).toHaveLength(1);
}, 30000);

it('откатывает данные, если запись в очередь не удалась', async () => {
  const user = await registerUser(env.app, env.ctx); const db = await local(user);
  await db.db.execute(sql`DROP TABLE local_outbox`);
  await expect(saveBodyWeight(db, '2026-10-13', 70)).rejects.toThrow();
  expect(await readEntity(db.db, db.account.userId, 'weight:2026-10-13')).toBeNull();
}, 30000);
