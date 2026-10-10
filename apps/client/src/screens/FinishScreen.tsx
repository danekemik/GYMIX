import { useState } from 'react';
import { plural } from '../lib/draft';
import { formatDate, formatDurationMs } from '../lib/format';
import { saveTemplate } from '../lib/templates';
import { useDb } from '../hooks/useDb';
import type { FinishPayload } from './ExecuteScreen';

interface FinishScreenProps {
  payload: FinishPayload;
  onDone: () => void;
  onOpenHistory: () => void;
  onOpenTemplates: () => void;
}

type Dialog = 'idle' | 'naming' | 'saving' | 'error' | 'saved';

export function FinishScreen({ payload, onDone, onOpenHistory, onOpenTemplates }: FinishScreenProps) {
  const { db } = useDb();
  const { workout, sets } = payload;
  const total = workout.entries.length;
  const skippedFlags = payload.skippedExercises;
  const completed = sets.filter(
    (group, ex) => skippedFlags?.[ex] !== true && group.length > 0 && group.every((s) => s.done),
  ).length;
  const partial = completed > 0 && completed < total;
  const duration = formatDurationMs(payload.endedAt - payload.startedAt);
  const date = formatDate(new Date(payload.endedAt));
  const [dialog, setDialog] = useState<Dialog>('idle');
  const [name, setName] = useState<string>(workout.type);

  const save = async () => {
    const title = name.trim();
    if (title === '') return;
    if (db === undefined) {
      setDialog('error');
      return;
    }
    setDialog('saving');
    try {
      await saveTemplate(db, {
        title,
        type: workout.type,
        volume: workout.volume,
        entries: workout.entries.map((entry) => ({
          slotKey: entry.slotKey,
          exerciseName: entry.exercise.name,
        })),
      });
      setDialog('saved');
    } catch {
      setDialog('error');
    }
  };

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
            const done = skippedFlags?.[ex] !== true && group.length > 0 && group.every((s) => s.done);
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
                  {group.map((set, index) => {
                    const setDone = set.done && skippedFlags?.[ex] !== true;
                    return (
                      <span
                        key={index}
                        className={`finish-set ${setDone ? 'finish-set--done' : ''}`}
                      >
                        {setDone ? `${set.weight || '—'}×${set.reps || '—'}` : '—'}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="screen__cta">
          <button className="btn btn--primary" onClick={onDone}>
            Готово
          </button>
          <button className="btn btn--ghost" onClick={() => setDialog('naming')}>
            Сохранить как шаблон
          </button>
          <button className="btn btn--ghost" onClick={onOpenHistory}>
            Открыть историю
          </button>
        </div>
      </div>

      {dialog === 'naming' && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title">
            <h2 id="save-title" className="dialog__title">
              Сохранить как шаблон
            </h2>
            <p className="dialog__text">
              Шаблон появится на главном экране и будет доступен для повторного
              старта.
            </p>
            <label className="field">
              <span className="field__label">Название</span>
              <input
                className="field__input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void save();
                }}
                autoFocus
                maxLength={60}
              />
            </label>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => void save()}>
                Сохранить
              </button>
              <button className="btn btn--ghost" onClick={() => setDialog('idle')}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog === 'saving' && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true">
            <h2 className="dialog__title">Сохраняем шаблон…</h2>
          </div>
        </div>
      )}

      {dialog === 'error' && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-error">
            <h2 id="save-error" className="dialog__title">
              Не удалось сохранить
            </h2>
            <p className="dialog__text">
              Проверь подключение и попробуй ещё раз.
            </p>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => setDialog('naming')} autoFocus>
                Повторить
              </button>
              <button className="btn btn--ghost" onClick={() => setDialog('idle')}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog === 'saved' && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-done">
            <h2 id="save-done" className="dialog__title">
              Шаблон сохранён
            </h2>
            <p className="dialog__text">
              «{name.trim()}» теперь в разделе «Мои тренировки».
            </p>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={onOpenTemplates} autoFocus>
                К шаблонам
              </button>
              <button className="btn btn--ghost" onClick={onDone}>
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}