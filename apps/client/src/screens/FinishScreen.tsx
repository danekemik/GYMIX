import { plural } from '../lib/draft';
import { formatDate, formatDurationMs } from '../lib/format';
import type { FinishPayload } from './ExecuteScreen';

interface FinishScreenProps {
  payload: FinishPayload;
  onDone: () => void;
  onOpenHistory: () => void;
}

export function FinishScreen({ payload, onDone, onOpenHistory }: FinishScreenProps) {
  const { workout, sets } = payload;
  const total = workout.entries.length;
  const completed = sets.filter((group) => group.length > 0 && group.every((s) => s.done)).length;
  const partial = completed > 0 && completed < total;
  const duration = formatDurationMs(payload.endedAt - payload.startedAt);
  const date = formatDate(new Date(payload.endedAt));

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title topbar__title--step">Итог тренировки</h1>
      </header>

      <div className="screen__body">
        <div className="finish-hero">
          <span className="finish-hero__score">
            {completed} <span className="finish-hero__total">/ {total}</span>
          </span>
          <span className="finish-hero__caption">
            {plural(completed, ['упражнение', 'упражнения', 'упражнений'])} выполнено
          </span>
          <span className="finish-hero__meta">
            {duration} <span aria-hidden>·</span> {date}
          </span>
        </div>

        {partial && (
          <div className="note">
            Тренировка завершена частично — пропущенные упражнения не будут
            засчитаны.
          </div>
        )}

        {payload.saved === false && (
          <div className="note note--error" role="alert">
            Запись не сохранилась в историю. Проверь подключение и повтори
            позже.
          </div>
        )}

        <ul className="finish-list">
          {workout.entries.map((entry, ex) => {
            const group = sets[ex] ?? [];
            const done = group.length > 0 && group.every((s) => s.done);
            return (
              <li key={entry.slotKey} className="finish-ex">
                <div className="finish-ex__head">
                  <span className="finish-ex__name">{entry.exercise.name}</span>
                  <span className={`finish-tag ${done ? 'finish-tag--done' : 'finish-tag--skip'}`}>
                    {done ? 'Выполнено' : 'Пропущено'}
                  </span>
                </div>
                <span className="finish-ex__group">{entry.groupUsed}</span>
                <div className="finish-ex__sets">
                  {group.map((set, index) => (
                    <span
                      key={index}
                      className={`finish-set ${set.done ? 'finish-set--done' : ''}`}
                    >
                      {set.done ? `${set.weight || '—'}×${set.reps || '—'}` : '—'}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="screen__cta">
          <button className="btn btn--primary" onClick={onDone}>
            Готово
          </button>
          <button className="btn btn--ghost" onClick={onOpenHistory}>
            Открыть историю
          </button>
        </div>
      </div>
    </div>
  );
}