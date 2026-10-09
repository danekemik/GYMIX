import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GymixDb } from '../lib/db';
import { getDb } from '../lib/db';

interface DbState {
  readonly db: GymixDb | undefined;
  readonly error: unknown;
  readonly counts: { exercises: number; muscleGroups: number } | undefined;
}

const DbContext = createContext<DbState>({ db: undefined, error: undefined, counts: undefined });

export function DbProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DbState>({
    db: undefined,
    error: undefined,
    counts: undefined,
  });

  useEffect(() => {
    let alive = true;
    getDb()
      .then((db) => alive && setState({ db, error: undefined, counts: db.counts }))
      .catch((error) => alive && setState({ db: undefined, error, counts: undefined }));
    return () => {
      alive = false;
    };
  }, []);

  return <DbContext.Provider value={state}>{children}</DbContext.Provider>;
}

export function useDb(): DbState {
  return useContext(DbContext);
}