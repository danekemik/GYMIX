import { downloadLocalBackup } from '../data/sync/backup';
import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { ApiError } from '../data/auth/api';
import { getSession } from '../data/auth/session';
import { synchronize, resolveConflict } from '../data/sync/engine';
import { queueEntries, subscribeStore, type QueueEntry } from '../data/sync/store';
import { AuthScreen } from '../screens/AuthScreen';

export function SyncStatus() {
  const { db } = useDb();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  const [message, setMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [login, setLogin] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!db) return;
    let stopped = false;
    const refresh = async () => { const current = await queueEntries(db.db); if (!stopped) setQueue(current); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const run = async () => {
      if (running || stopped || getSession()?.user.id !== db.account.userId) return;
      running = true;
      try {
        await navigator.locks.request(`gymix:sync:${db.account.userId}`, { ifAvailable: true }, async lock => {
          if (!lock || stopped) return;
          setBusy(true);
          await synchronize(db);
          if (!stopped) { setMessage(''); setNeedsLogin(false); setSynced(true); }
        });
      } catch (error) {
        if (!stopped) {
          setNeedsLogin(error instanceof ApiError && error.status === 401);
          setMessage(error instanceof ApiError ? error.message : 'Нет связи с сервером. Изменения сохранены на устройстве.');
        }
      } finally { running = false; if (!stopped) { setBusy(false); void refresh(); } }
    };
    const schedule = () => { void refresh(); clearTimeout(timer); timer = setTimeout(() => void run(), 300); };
    const unsubscribe = subscribeStore(schedule);
    const visible = () => { if (document.visibilityState === 'visible') schedule(); };
    window.addEventListener('online', schedule); document.addEventListener('visibilitychange', visible);
    const interval = setInterval(schedule, 15000);
    void refresh(); void run();
    return () => { stopped = true; clearTimeout(timer); clearInterval(interval); unsubscribe(); window.removeEventListener('online', schedule); document.removeEventListener('visibilitychange', visible); };
  }, [db, retry]);
  const resolve = async (entry: QueueEntry, choice: 'server' | 'local') => {
    if (!db) return;
    setBusy(true);
    try {
      await navigator.locks.request(`gymix:sync:${db.account.userId}`, () => resolveConflict(db, entry.key, choice));
      setRetry(value => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось разрешить конфликт'); }
    finally { setBusy(false); }
  };
  const download = async () => { if (db) await downloadLocalBackup(db); };
  if (login) return <AuthScreen reauthenticate onCancel={() => setLogin(false)} onSuccess={() => { setLogin(false); setRetry(x => x + 1); }} />;
  const conflicts = queue.filter(x => x.state === 'conflict');
  const alert = needsLogin || conflicts.length > 0;
  const pending = queue.length > 0 || message !== '';
  const showActions = alert || pending || !synced;
  return <aside className="sync-notice" aria-label="Синхронизация" data-state={alert ? 'alert' : pending ? 'pending' : 'idle'}>
    <div className="sync-notice__status">
      <span className="sync-notice__dot" aria-hidden />
      <p role="status" className="sync-notice__text">{!db ? 'Открываем локальную базу…' : busy ? 'Синхронизация…' : conflicts.length ? 'Есть изменения, требующие решения.' : queue.length ? `Сохранено на устройстве · ждут отправки: ${queue.length}` : message || (synced ? 'Все изменения синхронизированы' : 'Проверяем синхронизацию…')}</p>
    </div>
    {message && queue.length > 0 && <p className="sync-notice__text sync-notice__text--muted">{message}</p>}
    {showActions && <div className="sync-notice__actions">
      <button type="button" className="sync-notice__btn" onClick={() => setRetry(x => x + 1)} disabled={busy}>Синхронизировать</button>
      {needsLogin && <button type="button" className="sync-notice__btn sync-notice__btn--accent" onClick={() => setLogin(true)}>Войти повторно</button>}
    </div>}
    {conflicts.map(entry => <section className="sync-notice__conflict" key={entry.seq}>
      <p className="sync-notice__text">{entry.reply?.message ?? 'Запись изменена на другом устройстве.'}</p>
      <p className="sync-notice__text sync-notice__text--muted">{entry.payload?.kind === 'template' ? entry.payload.title : entry.payload?.kind === 'workout' ? `${entry.payload.type} · ${entry.payload.startedAt.slice(0, 10)}` : entry.key.startsWith('weight:') ? `Вес тела · ${entry.key.slice(7)}` : 'Исключённые упражнения'}</p>
      <div className="sync-notice__actions">
        <button type="button" className="sync-notice__btn" disabled={busy} onClick={() => void resolve(entry, 'server')}>Использовать версию сервера</button>
        {entry.reply?.reason !== 'operation_rejected' && <button type="button" className="sync-notice__btn" disabled={busy} onClick={() => void resolve(entry, 'local')}>{entry.reply?.record.payload?.kind === 'workout' && entry.reply.record.payload.status === 'active' && entry.reply.record.payload.owningDeviceId !== db?.account.deviceId ? 'Продолжить здесь и отправить мои изменения' : 'Отправить мой вариант вместо серверного'}</button>}
      </div>
      <p className="sync-notice__text sync-notice__text--muted">Локальная копия останется в резервной выгрузке.</p>
    </section>)}
    {(conflicts.length > 0 || message) && <div className="sync-notice__actions">
      <button type="button" className="sync-notice__btn" onClick={() => void download().catch(() => setMessage('Не удалось подготовить выгрузку'))}>Скачать локальную резервную копию</button>
    </div>}
  </aside>;
}
