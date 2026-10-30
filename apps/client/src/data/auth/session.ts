export interface AccountSession {
  user: { id: string; email: string; emailVerifiedAt: string | null; createdAt: string; };
  deviceId: string;
  accessToken: string;
  refreshToken: string;
}
const KEY = 'gymix:account:v1';
const INSTALLATION = 'gymix:installation:v1';
let current: AccountSession | null | undefined;
const listeners = new Set<() => void>();
export function getSession(): AccountSession | null {
  if (current !== undefined) return current;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AccountSession | null;
    current = value?.user?.id && value.deviceId && value.refreshToken ? value : null;
  } catch { current = null; }
  return current;
}
export function reloadSession(): AccountSession | null { current = undefined; return getSession(); }
export function setSession(value: AccountSession | null): void {
  // Storage failure must be visible; a remembered offline login is not optional.
  if (value) localStorage.setItem(KEY, JSON.stringify(value));
  else localStorage.removeItem(KEY);
  current = value;
  listeners.forEach((notify) => notify());
}
export function subscribeSession(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}
export function installationId(): string {
  let id = localStorage.getItem(INSTALLATION);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(INSTALLATION, id); }
  return id;
}
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  current = undefined;
  listeners.forEach((notify) => notify());
});
