import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { formatDay, formatDurationMs } from '../lib/format';
import { sessionsForHistory, type HistoryItem } from '../lib/session';

interface HistoryScreenProps {
  embedded?: boolean;
  onOpen: (sessionId: string) => void;
  onBack?: () => void;
}

export function HistoryScreen({ onOpen, onBack, embedded = false }: HistoryScreenProps) {
  const { db, revision } = useDb();
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
  }, [db, revision]);

  return (
    <div className={embedded ? "library__content" : "screen"}>
      {!embedded && <header className="topbar">
        {onBack !== undefined && (
          <button className="topbar__back" onClick={onBack} aria-label="Назад">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <h1 className="topbar__title">История</h1>
      </header>}

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
              Заверши первую тренировку — здесь сохранятся упражнения, подходы и время занятия.
            </p>
          </div>
        )}

        {items !== undefined && items.length > 0 && (
          <ul className="history">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className="history-row"
                  onClick={() => onOpen(item.id)}
                  aria-label={`Тренировка ${item.type}, ${formatDay(item.completedAt)}`}
                >
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}