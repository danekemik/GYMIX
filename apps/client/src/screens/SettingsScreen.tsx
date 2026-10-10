import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../hooks/useDb';
import {
  includeAllExcluded,
  includeExerciseByName,
  listExcluded,
  type ExcludedExercise,
} from '../lib/exclusions';

export function SettingsScreen() {
  const { db } = useDb();
  const [items, setItems] = useState<ExcludedExercise[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const reload = async () => {
    if (db === undefined) return;
    try {
      setItems(await listExcluded(db));
      setError(undefined);
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    void listExcluded(db)
      .then((rows) => alive && setItems(rows))
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [db]);

  const filtered = useMemo(() => {
    if (items === undefined) return undefined;
    const q = query.trim().toLowerCase();
    if (q === '') return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const toggle = async (item: ExcludedExercise) => {
    if (db === undefined || busy) return;
    setBusy(true);
    try {
      await includeExerciseByName(db, item.name);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async () => {
    if (db === undefined) return;
    setBusy(true);
    try {
      await includeAllExcluded(db);
      await reload();
      setConfirmingAll(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title">Настройки</h1>
      </header>

      <div className="screen__body">
        <section className="settings">
          <div className="settings__head">
            <h2 className="settings__title">Исключённые упражнения</h2>
            <p className="settings__text">
              «Не предлагать» прячет упражнение из генераций. Уже сохранённые
              тренировки и шаблоны не меняются.
            </p>
          </div>

          {error !== undefined && (
            <p className="body-error" role="alert">
              Не удалось загрузить список: {error}
            </p>
          )}

          {error === undefined && items === undefined && (
            <p className="body-muted">Загружаем список…</p>
          )}

          {error === undefined && items !== undefined && (
            <>
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

              {items.length > 0 && (
                <div className="settings__tools">
                  <button
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => setConfirmingAll(true)}
                  >
                    Вернуть все
                  </button>
                </div>
              )}

              {filtered !== undefined && filtered.length === 0 && (
                <div className="empty">
                  <h2 className="empty__title">
                    {items.length === 0 ? 'Список пуст' : 'Ничего не найдено'}
                  </h2>
                  <p className="empty__text">
                    {items.length === 0
                      ? 'Отмечай упражнения в предпросмотре «Не предлагать» — они появятся здесь.'
                      : 'Попробуй другой запрос.'}
                  </p>
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
      </div>

      {confirmingAll && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Вернуть все исключённые упражнения?"
          >
            <h2 className="dialog__title">Вернуть все упражнения?</h2>
            <p className="dialog__text">
              Список «Не предлагать» очистится — все упражнения снова будут
              попадать в подбор.
            </p>
            <div className="dialog__actions">
              <button
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void restoreAll()}
              >
                Вернуть все
              </button>
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setConfirmingAll(false)}
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