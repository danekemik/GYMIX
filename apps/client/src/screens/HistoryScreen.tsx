import { typeLabel } from '../lib/workoutTypes';
import { useLocalRead } from '../hooks/useLocalRead';
import { formatDay, formatDurationMs } from '../lib/format';
import { type HistoryItem } from '../lib/session';

interface HistoryScreenProps {
  onOpen: (sessionId: string) => void;
  onStart: () => void;
}

export function HistoryScreen({ onOpen, onStart }: HistoryScreenProps) {
  const { data: items, error, reload } = useLocalRead<HistoryItem[]>('history');

  return (
    <div className="library__content">
      <div className="screen__body">
        {error !== undefined && (
          <div className="note note--error" role="alert">
            Не удалось загрузить историю. <button className="text-action" onClick={() => void reload()}>Повторить</button>
          </div>
        )}

        {error === undefined && items === undefined && (
          <p className="body-muted">Загружаем историю…</p>
        )}

        {error === undefined && items !== undefined && items.length === 0 && (
          <div className="empty empty--history">
            <h2 className="empty__title">Здесь появятся тренировки</h2>
            <p className="empty__text">
              Заверши первую — сохраним упражнения, подходы и время занятия.
            </p>
            <button className="btn btn--primary btn--sm" onClick={onStart}>
              Собрать тренировку
            </button>
          </div>
        )}

        {items !== undefined && items.length > 0 && (
          <ul className="history">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className="history-row"
                  onClick={() => onOpen(item.id)}
                  aria-label={`Тренировка ${typeLabel(item.type)}, ${formatDay(item.completedAt)}, выполнено ${item.done} из ${item.total} упражнений`}
                >
                  <span className="history-row__main">
                    <span className="history-row__head">
                      <span className="history-row__type">{typeLabel(item.type)}</span>
                      <span className="history-row__date">{formatDay(item.completedAt)}</span>
                    </span>
                    <span className="history-row__meta">
                      {item.volume}
                      <span aria-hidden="true"> · </span>
                      {item.done} из {item.total} упражнений
                      <span aria-hidden="true"> · </span>
                      {formatDurationMs(item.durationMs)}
                    </span>
                  </span>
                  <svg className="history-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
