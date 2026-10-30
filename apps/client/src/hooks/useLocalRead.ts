import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useDb } from './useDb';
import { cacheFor } from '../data/local/read-cache';
import { queryReadModel, type ReadModel } from '../data/local/read-rpc';

const empty = { data: undefined, error: undefined };
export function useLocalRead<T>(key: ReadModel, cacheKey: string = key) {
  const { db } = useDb();
  const cache = db ? cacheFor(db) : undefined;
  const entry = cache?.entry<T>(cacheKey, () => queryReadModel<T>(db!, key));
  const subscribe = useCallback((notify: () => void) => {
    entry?.listeners.add(notify);
    return () => { entry?.listeners.delete(notify); };
  }, [entry]);
  const getSnapshot = useCallback(() => entry?.snapshot ?? empty, [entry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => { if (cache && entry) void cache.refresh(entry); }, [cache, entry]);
  const reload = useCallback(async () => { if (cache && entry) await cache.refresh(entry, true); }, [cache, entry]);
  return { ...snapshot, reload };
}
