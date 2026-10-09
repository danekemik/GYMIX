import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { formatDay, formatDurationMs } from '../lib/format';
import { sessionsForHistory, type HistoryItem } from '../lib/session';

export function HistoryScreen() {
  const { db } = useDb();
  const [items, setItems] = useState<HistoryItem[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    sessionsForHistory(db)
      .then((rows) => alive && setItems(rows))
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [db]);

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title">История</h1>
      </header>

      <div className="screen__body">
        {error !== undefined && (
          <p className="body-error" role="alert">
            Не удалось загрузить историю: {error}
          </p>
        )}

        {error === undefined && items === undefined && (
          <p className="body-muted">Загружаем историю…</p>
        )}

        {error === undefined && items !== undefined && items.length === 0 && (
          <div className="empty">
            <h2 className="empty__title">Пока пусто</h2>
            <p className="empty__text">
              Заверши первую тренировку — она появится здесь как снимок сессии.
            </p>
          </div>
        )}

        {items !== undefined && items.length > 0 && (
          <ul className="history">
            {items.map((item) => (
              <li key={item.id} className="history-row">
                <div className="history-row__head">
                  <span className="history-row__type">{item.type}</span>
                  <span className="history-row__score">
                    {item.done}
                    <span className="history-row__score-total">/{item.total}</span>
                  </span>
                </div>
                <span className="history-row__meta">{item.volume}</span>
                <span className="history-row__sub">
                  {formatDay(item.completedAt)} · {formatDurationMs(item.durationMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}