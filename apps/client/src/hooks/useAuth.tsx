import { useSyncExternalStore } from 'react';
import { getSession, subscribeSession } from '../data/auth/session';
export function useAuth() { return useSyncExternalStore(subscribeSession, getSession, () => null); }
