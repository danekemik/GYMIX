import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getSession, installationId, reloadSession, setSession, subscribeSession, type AccountSession } from '../src/data/auth/session';
const values = new Map<string, string>();
const session = (id: string): AccountSession => ({ user: { id, email: `${id}@example.com`, emailVerifiedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, deviceId: 'device', accessToken: 'access', refreshToken: 'refresh' });
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  values.clear(); reloadSession();
});
afterEach(() => vi.unstubAllGlobals());
it('сохраняет вход для повторного открытия без сети и очищает его при выходе', () => {
  setSession(session('a'));
  expect(reloadSession()?.user.id).toBe('a');
  setSession(null);
  expect(reloadSession()).toBeNull();
});
it('уведомляет о смене аккаунта и сохраняет один ID установки', () => {
  const listener = vi.fn(); const unsubscribe = subscribeSession(listener);
  setSession(session('a')); setSession(session('b'));
  expect(getSession()?.user.id).toBe('b'); expect(listener).toHaveBeenCalledTimes(2);
  expect(installationId()).toBe(installationId()); unsubscribe();
});
it('не скрывает ошибку записи в хранилище', () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
  expect(() => setSession(session('a'))).toThrow('quota'); expect(getSession()).toBeNull();
});

it('обновляет истёкший вход один раз для параллельных запросов', async () => {
  const { accountRequest } = await import('../src/data/auth/api');
  setSession(session('a'));
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, task: () => Promise<unknown>) => task() } });
  let refreshes = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return Response.json({ accessToken: 'new-access', refreshToken: 'new-refresh', deviceId: 'device' }); }
    const header = (init?.headers as Record<string, string>)?.['Authorization'];
    return header === 'Bearer new-access' ? Response.json({ ok: true }) : Response.json({ error: { code: 'unauthorized', message: 'expired' } }, { status: 401 });
  }));
  expect(await Promise.all([accountRequest('/account'), accountRequest('/account')])).toEqual([{ ok: true }, { ok: true }]);
  expect(refreshes).toBe(1); expect(getSession()?.refreshToken).toBe('new-refresh');
});
it('не удаляет локальный вход, когда обновить сессию не удалось без сети', async () => {
  const { accountRequest } = await import('../src/data/auth/api');
  setSession(session('offline'));
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, task: () => Promise<unknown>) => task() } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/auth/refresh')) throw new TypeError('offline');
    return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }));
  await expect(accountRequest('/account')).rejects.toThrow('offline');
  expect(reloadSession()?.user.id).toBe('offline');
});
