import type { GymixDb } from '../../lib/db';

export interface ReadSnapshot<T> { data: T | undefined; error: Error | undefined; }
interface Entry<T> { snapshot: ReadSnapshot<T>; version: number; pending?: Promise<void>; listeners: Set<() => void>; load: () => Promise<T>; }
export class ReadCache {
  private version = 0;
  private entries = new Map<string, Entry<unknown>>();
  entry<T>(key: string, load: () => Promise<T>): Entry<T> {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { snapshot: { data: undefined, error: undefined }, version: -1, listeners: new Set(), load };
      this.entries.set(key, entry);
    }
    entry.load = load;
    return entry as Entry<T>;
  }
  async refresh<T>(entry: Entry<T>, force = false): Promise<void> {
    if (entry.pending) return entry.pending;
    if (!force && entry.version === this.version) return;
    const version = this.version;
    const load = entry.load;
    entry.pending = (async () => {
      try {
        const data = await Promise.resolve().then(load);
        // A write while a read was running makes this response obsolete.
        if (version === this.version) { entry.snapshot = { data, error: undefined }; entry.version = version; }
      } catch (error) {
        if (version === this.version) entry.snapshot = { ...entry.snapshot, error: error instanceof Error ? error : new Error(String(error)) };
      } finally {
        delete entry.pending;
        entry.listeners.forEach(notify => notify());
        if (version !== this.version && entry.listeners.size) void this.refresh(entry);
      }
    })();
    return entry.pending;
  }
  invalidate() {
    this.version++;
    for (const entry of this.entries.values()) if (entry.listeners.size) void this.refresh(entry);
  }
  publish<T>(key: string, data: T, load: () => Promise<T>) {
    const entry = this.entry(key, load);
    entry.snapshot = { data, error: undefined };
    entry.version = this.version;
    entry.listeners.forEach(notify => notify());
  }
}

const caches = new WeakMap<GymixDb, ReadCache>();
export function cacheFor(db: GymixDb) {
  let cache = caches.get(db);
  if (!cache) { cache = new ReadCache(); caches.set(db, cache); }
  return cache;
}
export function invalidateReads(db: GymixDb) { caches.get(db)?.invalidate(); }
