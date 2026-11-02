import { downloadLocalBackup } from '../data/sync/backup';
import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { ApiError } from '../data/auth/api';
import { getSession } from '../data/auth/session';
import { synchronize, resolveConflict } from '../data/sync/engine';
import { queueEntries, subscribeStore, type QueueEntry } from '../data/sync/store';
import { startSyncRunner } from '../data/sync/runner';
import { AuthScreen } from '../screens/AuthScreen';

export function SyncStatus() {
  const { db } = useDb();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [login, setLogin] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!db) return;
    let stopped = false;
    const refresh = async () => { const current = await queueEntries(db.db); if (!stopped) setQueue(current); };
    const runner = startSyncRunner({
      run: async () => {
        if (getSession()?.user.id !== db.account.userId) return false;
        return navigator.locks.request(`gymix:sync:${db.account.userId}`, { ifAvailable: true }, async lock => {
          if (!lock || stopped) return false;
          await synchronize(db);
          await refresh();
          return true;
        });
      },
      onBusy: setBusy,
      onSuccess: () => { setMessage(''); setNeedsLogin(false); },
      onError: error => {
        setNeedsLogin(error instanceof ApiError && error.status === 401);
        setMessage(error instanceof ApiError ? error.message : 'Нет связи с сервером. Изменения сохранены на устройстве.');
        void refresh().catch(() => undefined);
      },
    });
    const unsubscribe = subscribeStore(reason => {
      void refresh().catch(() => undefined);
      if (reason === 'local') runner.request();
    });
    const online = () => runner.request();
    const visible = () => { if (document.visibilityState === 'visible') runner.request(); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    runner.request(true);
    return () => {
      stopped = true;
      runner.stop();
      setBusy(false);
      unsubscribe();
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
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
  // Sync runs in the background. Only actionable conflicts or reauthentication
  // belong in the global UI; opening/reading/success/offline are silent.
  if (!alert) return null;
  return <aside className="sync-notice" aria-label="Синхронизация" data-state="alert">
    <div className="sync-notice__status">
      <span className="sync-notice__dot" aria-hidden />
      <p role="status" className="sync-notice__text">{conflicts.length ? 'Есть изменения, требующие решения.' : 'Нужно повторно войти для синхронизации.'}</p>
    </div>
    <details className="sync-notice__details" open={alert || undefined}>
      <summary>Подробнее</summary>
      {message && <p className="sync-notice__text sync-notice__text--muted">{message}</p>}
      <div className="sync-notice__actions">
        <button type="button" className="sync-notice__btn" onClick={() => setRetry(x => x + 1)} disabled={busy}>Синхронизировать</button>
        {needsLogin && <button type="button" className="sync-notice__btn sync-notice__btn--accent" onClick={() => setLogin(true)}>Войти повторно</button>}
      </div>
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
        <button type="button" className="sync-notice__btn" onClick={() => void download().catch(() => setMessage('Не удалось подготовить выгрузку'))}>Сохранить копию перед решением</button>
      </div>}
    </details>
  </aside>;
}
