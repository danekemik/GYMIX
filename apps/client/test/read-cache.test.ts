import { expect, it, vi } from 'vitest';
import { ReadCache } from '../src/data/local/read-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
it('deduplicates concurrent reads and reuses data on a later screen visit', async () => {
  const cache = new ReadCache();
  const load = vi.fn(async () => ['saved']);
  const entry = cache.entry('history', load);
  await Promise.all([cache.refresh(entry), cache.refresh(entry)]);
  expect(entry.snapshot.data).toEqual(['saved']);
  await cache.refresh(cache.entry('history', load));
  expect(load).toHaveBeenCalledTimes(1);
});
it('retains visible data while refreshing after a committed write', async () => {
  const cache = new ReadCache(); const next = deferred<string>();
  const entry = cache.entry('history', async () => 'before');
  await cache.refresh(entry);
  entry.load = () => next.promise; entry.listeners.add(() => {});
  cache.invalidate();
  expect(entry.snapshot.data).toBe('before');
  next.resolve('after'); await cache.refresh(entry);
  expect(entry.snapshot.data).toBe('after');
});
it('does not publish a stale response when a write occurs during a read', async () => {
  const cache = new ReadCache(); const first = deferred<string>();
  const entry = cache.entry('history', () => first.promise);
  entry.listeners.add(() => {});
  const pending = cache.refresh(entry);
  entry.load = async () => 'new'; cache.invalidate();
  first.resolve('stale'); await pending; await cache.refresh(entry);
  expect(entry.snapshot.data).toBe('new');
});
it('keeps cached data after a failed refresh and permits retry', async () => {
  const cache = new ReadCache(); const entry = cache.entry('history', async () => 'kept');
  await cache.refresh(entry);
  entry.load = async () => { throw new Error('failed'); };
  await cache.refresh(entry, true);
  expect(entry.snapshot.data).toBe('kept'); expect(entry.snapshot.error?.message).toBe('failed');
  entry.load = async () => 'recovered'; await cache.refresh(entry, true);
  expect(entry.snapshot).toEqual({ data: 'recovered', error: undefined });
});
it('isolates cached data between database/account instances', async () => {
  const first = new ReadCache(); const second = new ReadCache();
  const a = first.entry('history', async () => ['account-a']);
  const b = second.entry('history', async () => ['account-b']);
  await Promise.all([first.refresh(a), second.refresh(b)]);
  first.invalidate();
  expect(b.snapshot.data).toEqual(['account-b']);
  expect(a.snapshot.data).toEqual(['account-a']);
});
