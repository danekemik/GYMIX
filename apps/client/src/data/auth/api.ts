import { getSession, installationId, reloadSession, setSession, type AccountSession } from './session';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function publicRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  return decode<T>(response);
}
async function decode<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error?.code ?? 'network', data.error?.message ?? 'Не удалось выполнить запрос');
  return data as T;
}
let refresh: Promise<AccountSession> | undefined;
async function refreshSession(expected: AccountSession): Promise<AccountSession> {
  // One refresh across all tabs: rotating a token twice would revoke the session.
  return navigator.locks.request('gymix:refresh', async () => {
    const actual = reloadSession();
    if (!actual || actual.user.id !== expected.user.id) throw new ApiError(401, 'unauthorized', 'Войдите в аккаунт повторно');
    if (actual.refreshToken !== expected.refreshToken) return actual;
    const issued = await publicRequest<Omit<AccountSession, 'user'>>('/auth/refresh', { refreshToken: actual.refreshToken });
    const updated = { ...actual, ...issued, user: actual.user };
    // Do not revive an account that was signed out while the request ran.
    if (getSession()?.refreshToken !== actual.refreshToken) throw new ApiError(401, 'unauthorized', 'Вход изменён в другой вкладке');
    setSession(updated);
    return updated;
  });
}
export async function accountRequest<T>(path: string, body?: unknown): Promise<T> {
  const session = getSession();
  if (!session) throw new ApiError(401, 'unauthorized', 'Войдите в аккаунт');
  const send = (token: string) => fetch(`/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  let response = await send(session.accessToken);
  if (response.status === 401) {
    refresh ??= refreshSession(session).finally(() => { refresh = undefined; });
    const updated = await refresh;
    if (updated.user.id !== session.user.id) throw new ApiError(401, 'unauthorized', 'Аккаунт изменён');
    response = await send(updated.accessToken);
  }
  if (getSession()?.user.id !== session.user.id) throw new ApiError(401, 'unauthorized', 'Аккаунт изменён');
  return decode<T>(response);
}
export async function signIn(email: string, password: string): Promise<void> {
  const result = await publicRequest<AccountSession>('/auth/login', { email, password, installationId: installationId() });
  setSession(result);
}
export async function verifySignUp(email: string, code: string): Promise<void> {
  setSession(await publicRequest<AccountSession>('/auth/verify-email', { email, code, installationId: installationId() }));
}
export async function signOut(): Promise<void> {
  const session = getSession();
  // Locally signing out is always possible offline. Server access expires or
  // can be revoked later from the account's device list.
  if (session && navigator.onLine) {
    await fetch('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
  setSession(null);
}
