import { useLocalRead } from '../hooks/useLocalRead';
import { downloadLocalBackup } from '../data/sync/backup';
import { signOut } from '../data/auth/api';
import { getSession } from '../data/auth/session';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  includeAllExcluded,
  includeExerciseByName,
  type ExcludedExercise,
} from '../lib/exclusions';

interface SettingsScreenProps {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { db } = useDb();
  const { data: items, error: readError, reload } = useLocalRead<ExcludedExercise[]>('exclusions');
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' }>();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const restoreDialog = useRef<HTMLElement>(null);
  const signOutDialog = useRef<HTMLElement>(null);
  useDialogFocus(restoreDialog, confirmingAll, () => { if (!busy) setConfirmingAll(false); });
  useDialogFocus(signOutDialog, confirmingSignOut, () => { if (!busy) setConfirmingSignOut(false); });

  useEffect(() => {
    if (notice === undefined) return;
    const timer = window.setTimeout(() => setNotice(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    if (items === undefined) return undefined;
    const q = query.trim().toLowerCase();
    if (q === '') return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const toggle = async (item: ExcludedExercise) => {
    if (db === undefined || busy) return;
    setBusy(true); setError(undefined);
    try {
      await includeExerciseByName(db, item.name);
      await reload();
      setNotice({ text: `«${item.name}» снова участвует в подборе.`, tone: 'ok' });
    } catch {
      setError('Не удалось вернуть упражнение в подбор. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async () => {
    if (db === undefined) return;
    setBusy(true); setError(undefined);
    try {
      await includeAllExcluded(db);
      await reload();
      setConfirmingAll(false);
      setNotice({ text: 'Все упражнения снова участвуют в подборе.', tone: 'ok' });
    } catch {
      setError('Не удалось вернуть упражнения. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    if (db === undefined) return;
    setBusy(true); setError(undefined);
    try {
      await downloadLocalBackup(db);
      setNotice({ text: 'Резервная копия скачана.', tone: 'ok' });
    } catch {
      setNotice({ text: 'Не удалось создать резервную копию. Попробуй ещё раз.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch {
      setConfirmingSignOut(false);
      setNotice({ text: 'Не удалось выйти из аккаунта. Попробуй ещё раз.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button><h1 className="topbar__title topbar__title--step">Настройки</h1>
      </header>

      <div className="screen__body">
        <section className="settings settings--account" aria-label="Аккаунт">
          <div className="settings__head">
            <h2 className="settings__title">Аккаунт</h2>
            <p className="settings__email">{getSession()?.user.email}</p>
          </div>
          <div className="settings__actions">
            <button className="btn btn--ghost" disabled={!db || busy} onClick={() => void backup()}>
              Скачать резервную копию
            </button>
          </div>
        </section>

        {notice !== undefined && (
          <p className={notice.tone === 'error' ? 'body-error' : 'body-muted'} role={notice.tone === 'error' ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}

        <section className="settings">
          <div className="settings__head">
            <h2 className="settings__title">Исключённые из подбора</h2>
            <p className="settings__text">
              Эти упражнения не попадают в новые тренировки. Уже сохранённые
              шаблоны и история не меняются.
            </p>
          </div>

          {(error !== undefined || readError !== undefined) && (
            <div className="note note--error" role="alert">
              {error ?? 'Не удалось загрузить список исключённых.'}
              <button className="text-action" onClick={() => { setError(undefined); void reload(); }}>Повторить</button>
            </div>
          )}

          {error === undefined && readError === undefined && items === undefined && (
            <p className="body-muted">Загружаем список…</p>
          )}

          {items !== undefined && (
            <>
              {items.length > 0 && (
                <div className="field settings__search">
                  <label className="field__label" htmlFor="settings-query">
                    Поиск
                  </label>
                  <input
                    id="settings-query"
                    className="field__input"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Название упражнения"
                    autoComplete="off"
                  />
                </div>
              )}

              {items.length > 0 && (
                <div className="settings__tools">
                  <button
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => setConfirmingAll(true)}
                  >
                    Вернуть все в подбор
                  </button>
                </div>
              )}

              {filtered !== undefined && filtered.length === 0 && (
                <div className="empty empty--compact">
                  <h2 className="empty__title">
                    {items.length === 0 ? 'Пока ничего не исключено' : 'Ничего не найдено'}
                  </h2>
                  <p className="empty__text">
                    {items.length === 0
                      ? 'Открой тренировку, нажми ⋯ у упражнения и выбери «Исключить из подбора».'
                      : 'Попробуй другое название или очисти поиск.'}
                  </p>
                  {items.length > 0 && query !== '' && (
                    <button className="text-action" onClick={() => setQuery('')}>Очистить поиск</button>
                  )}
                </div>
              )}

              {filtered !== undefined && filtered.length > 0 && (
                <ul className="excluded">
                  {filtered.map((item) => (
                    <li key={item.exerciseId} className="excluded__row">
                      <span className="excluded__body">
                        <span className="excluded__name">{item.name}</span>
                        <span className="excluded__meta">{item.primary}</span>
                      </span>
                      <button
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() => void toggle(item)}
                      >
                        Вернуть
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="settings settings--session" aria-label="Сессия">
          <div className="settings__head">
            <h2 className="settings__title">Сессия</h2>
            <p className="settings__text">
              Тренировки на устройстве останутся. Синхронизация остановится
              до следующего входа.
            </p>
          </div>
          <button className="btn btn--danger settings__signout" onClick={() => setConfirmingSignOut(true)}>
            Выйти из аккаунта
          </button>
        </section>
      </div>

      {confirmingAll && (
        <div className="overlay">
          <section
            ref={restoreDialog}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-all-title"
          >
            <h2 id="restore-all-title" className="dialog__title">Вернуть все упражнения в подбор?</h2>
            <p className="dialog__text">
              Список «Исключённые из подбора» очистится — все упражнения снова будут
              попадать в новые тренировки.
            </p>
            <div className="dialog__actions">
              <button
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void restoreAll()}
              >
                {busy ? 'Возвращаем…' : 'Вернуть все'}
              </button>
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setConfirmingAll(false)}
                autoFocus
              >
                Отмена
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmingSignOut && (
        <div className="overlay">
          <section
            ref={signOutDialog}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signout-title"
          >
            <h2 id="signout-title" className="dialog__title">Выйти из аккаунта?</h2>
            <p className="dialog__text">
              Тренировки и история останутся на устройстве. Для синхронизации
              потребуется войти повторно.
            </p>
            <div className="dialog__actions">
              <button
                className="btn btn--danger"
                disabled={busy}
                onClick={() => void doSignOut()}
              >
                {busy ? 'Выходим…' : 'Выйти'}
              </button>
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setConfirmingSignOut(false)}
                autoFocus
              >
                Отмена
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}