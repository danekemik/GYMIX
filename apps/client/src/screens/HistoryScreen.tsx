import { typeLabel } from '../lib/workoutTypes';
import { useLocalRead } from '../hooks/useLocalRead';
import { formatDay, formatDurationMs } from '../lib/format';
import { type HistoryItem } from '../lib/session';

interface HistoryScreenProps {
  onOpen: (sessionId: string) => void;
}

export function HistoryScreen({ onOpen }: HistoryScreenProps) {
  const { data: items, error } = useLocalRead<HistoryItem[]>('history');

  return (
    <div className="library__content">
      <div className="screen__body">
        {error !== undefined && (
          <p className="body-error" role="alert">
            Не удалось загрузить историю: {error.message}
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
                  aria-label={`Тренировка ${typeLabel(item.type)}, ${formatDay(item.completedAt)}`}
                >
                  <div className="history-row__head">
                    <span className="history-row__type">{typeLabel(item.type)}</span>
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