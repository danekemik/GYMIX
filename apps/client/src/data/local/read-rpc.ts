import type { ExcludedExercise } from '../../lib/exclusions';
import type { SetEntry } from '../../domain/session';
import type { GymixDb, LocalAccount } from '../../lib/db';

export const readChannel = (userId: string) => `gymix:reads:${userId}`;
export type ReadModel = 'history' | 'active' | 'templates' | 'exclusions' | 'week' | 'progress:6m' | 'progress:all' | 'previous' | `record:${string}` | `template:${string}` | `repeat:${string}` | `resume:${string}`;
export type ReadRequest = { type: 'read'; id: string; key: ReadModel; params?: { names?: readonly string[] }; deviceId: string; } | { type: 'initialize'; id: string; deviceId: string; email: string; };
interface ReadReply { type: 'result'; id: string; data?: unknown; error?: string; }

const clients = new WeakMap<GymixDb, { query: (key: ReadModel, params?: { names?: readonly string[] }) => Promise<unknown>; close: () => void; }>();
export function createReadClient(account: LocalAccount) {
  const channel = new BroadcastChannel(readChannel(account.userId));
  const pending = new Map<string, { request: ReadRequest; resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout>; }>();
  const receive = (event: MessageEvent<ReadReply | { type: 'ready' }>) => {
    if (event.data.type === 'ready') {
      // A new PGlite leader can take over after another tab closes.
      for (const item of pending.values()) channel.postMessage(item.request);
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
  const send = (input: { type: 'read'; key: ReadModel; params?: { names?: readonly string[] } } | { type: 'initialize'; email: string }): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const request: ReadRequest = { ...input, id, deviceId: account.deviceId };
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Не удалось прочитать локальные данные. Попробуй ещё раз.')); }, 20_000);
        pending.set(id, { request, resolve, reject, timer });
        channel.postMessage(request);
      });
  };
  return {
    initialize: () => send({ type: 'initialize', email: account.email }) as Promise<{ exercises: number; muscleGroups: number }>,
    query: (key: ReadModel, params?: { names?: readonly string[] }) => send({ type: 'read', key, ...(params ? { params } : {}) }),
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
