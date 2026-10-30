import { invalidateReads } from '../data/local/read-cache';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GymixDb, LocalAccount } from '../lib/db';
import { subscribeStore } from '../data/sync/store';
import { getDb } from '../lib/db';

interface DbState {
  readonly revision: number;
  readonly db: GymixDb | undefined;
  readonly error: unknown;
  readonly counts: { exercises: number; muscleGroups: number; } | undefined;
}

const DbContext = createContext<DbState>({ db: undefined, error: undefined, counts: undefined, revision: 0 });

export function DbProvider({ children, account }: { children: ReactNode; account: LocalAccount; }) {
  const [state, setState] = useState<DbState>({
    revision: 0,
    db: undefined,
    error: undefined,
    counts: undefined,
  });

  useEffect(() => {
    let alive = true;
    getDb(account)
      .then((db) => alive && setState({ db, error: undefined, counts: db.counts, revision: 0 }))
      .catch((error) => alive && setState({ db: undefined, error, counts: undefined, revision: 0 }));
    return () => {
      alive = false;
    };
  }, [account.userId, account.deviceId]);

  useEffect(() => subscribeStore(() => {
    if (state.db) invalidateReads(state.db);
    setState(previous => ({ ...previous, revision: previous.revision + 1 }));
  }), [state.db]);

  return <DbContext.Provider value={state}>{children}</DbContext.Provider>;
}

export function useDb(): DbState {
  return useContext(DbContext);
}