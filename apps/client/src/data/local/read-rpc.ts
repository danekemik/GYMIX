import type { ExcludedExercise } from '../../lib/exclusions';
import type { SetEntry } from '../../domain/session';
import type { GymixDb, LocalAccount } from '../../lib/db';
import type { SessionCommand, SessionCommandReply } from './session-commands';
import { cacheFor } from './read-cache';
import { notifyStore } from '../sync/store';
import type { SyncCommand, SyncCommandReply } from './sync-commands';

export const readChannel = (userId: string) => `gymix:reads:${userId}`;
export type ReadModel = 'history' | 'active' | 'templates' | 'exclusions' | 'week' | 'progress:6m' | 'progress:all' | 'previous' | `record:${string}` | `template:${string}` | `repeat:${string}` | `resume:${string}` | `ownership:${string}`;
export type ReadRequest = { type: 'read'; id: string; key: ReadModel; params?: { names?: readonly string[] }; deviceId: string; } | { type: 'initialize'; id: string; deviceId: string; email: string; } | { type: 'command'; id: string; deviceId: string; command: SessionCommand } | { type: 'sync'; id: string; deviceId: string; command: SyncCommand };
interface ReadReply { type: 'result'; id: string; data?: unknown; error?: string; }

const clients = new WeakMap<GymixDb, ReturnType<typeof createReadClient>>();
export function createReadClient(account: LocalAccount) {
  const channel = new BroadcastChannel(readChannel(account.userId));
  const pending = new Map<string, { request: ReadRequest; resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout>; }>();
  const receive = (event: MessageEvent<ReadReply | { type: 'ready' }>) => {
    if (event.data.type === 'ready') {
      // A new PGlite leader can take over after another tab closes.
      for (const [id, item] of pending) {
        // Replaying an unacknowledged write could duplicate a committed action.
        // Reads are safe to resend; after leader loss a write requires recovery.
        if (item.request.type === 'command' || item.request.type === 'sync') {
          pending.delete(id); clearTimeout(item.timer);
          item.reject(new Error('База перезапущена. Проверь сохранённую тренировку перед повтором.'));
        } else channel.postMessage(item.request);
      }
      return;
    }
    if (event.data.type !== 'result') return;
    const item = pending.get(event.data.id);
    if (!item) return;
    pending.delete(event.data.id); clearTimeout(item.timer);
    if (event.data.error) item.reject(new Error(event.data.error));
    else item.resolve(event.data.data);
  };
  channel.addEventListener('message', receive);
  const send = (input: { type: 'read'; key: ReadModel; params?: { names?: readonly string[] } } | { type: 'initialize'; email: string } | { type: 'command'; command: SessionCommand } | { type: 'sync'; command: SyncCommand }): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const request: ReadRequest = { ...input, id, deviceId: account.deviceId };
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(input.type === 'command' ? 'Не получено подтверждение сохранения. Проверь тренировку перед повтором.' : 'Не удалось прочитать локальные данные. Попробуй ещё раз.')); }, input.type === 'command' ? 60_000 : 20_000);
        pending.set(id, { request, resolve, reject, timer });
        channel.postMessage(request);
      });
  };
  return {
    initialize: () => send({ type: 'initialize', email: account.email }) as Promise<{ exercises: number; muscleGroups: number }>,
    query: (key: ReadModel, params?: { names?: readonly string[] }) => send({ type: 'read', key, ...(params ? { params } : {}) }),
    command: (command: SessionCommand) => send({ type: 'command', command }) as Promise<SessionCommandReply>,
    sync: (command: SyncCommand) => send({ type: 'sync', command }) as Promise<SyncCommandReply>,
    close() {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Аккаунт закрыт')); }
      pending.clear(); channel.close();
    },
  };
}
export function attachReadClient(db: GymixDb, client: ReturnType<typeof createReadClient>) { clients.set(db, client); }
export function closeReadClient(db: GymixDb) { clients.get(db)?.close(); clients.delete(db); }
export function queryReadModel<T>(db: GymixDb, key: ReadModel, params?: { names?: readonly string[] }): Promise<T> {
  const client = clients.get(db);
  if (client) return client.query(key, params) as Promise<T>;
  // In-memory databases in integration tests use exactly the same server functions.
  return import('./read-models').then(module => module.executeReadModel(db, key, params)) as Promise<T>;
}

export const queryExcludedNames = (db: GymixDb) => queryReadModel<ExcludedExercise[]>(db, 'exclusions').then(rows => rows.map(row => row.name));
export const queryPreviousSets = (db: GymixDb, names: readonly string[]) => queryReadModel<Map<string, SetEntry[]>>(db, 'previous', { names });

export function runSessionCommand(db: GymixDb, command: SessionCommand): Promise<SessionCommandReply['value']> | undefined {
  const client = clients.get(db);
  if (!client) return;
  return client.command(command).then(reply => {
    notifyStore();
    const cache = cacheFor(db);
    cache.invalidate();
    cache.publish('active', reply.active, () => queryReadModel(db, 'active'));
    if (reply.history) cache.publish('history', reply.history, () => queryReadModel(db, 'history'));
    if (reply.week) cache.publish(`week:${new Date().toDateString()}`, reply.week, () => queryReadModel(db, 'week'));
    if (reply.templates) cache.publish('templates', reply.templates, () => queryReadModel(db, 'templates'));
    if (reply.exclusions) cache.publish('exclusions', reply.exclusions, () => queryReadModel(db, 'exclusions'));
    if (reply.record) cache.publish(`record:${reply.record.id}`, reply.record, () => queryReadModel(db, `record:${reply.record!.id}`));
    return reply.value;
  });
}
export function runSyncCommand(db: GymixDb, command: SyncCommand): Promise<SyncCommandReply> | undefined {
  return clients.get(db)?.sync(command);
}
