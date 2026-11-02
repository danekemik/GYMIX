import { useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { plural, pluralForm } from '../lib/draft';
import { formatDate, formatDurationMs } from '../lib/format';
import { saveTemplate } from '../lib/templates';
import { downloadLocalBackup } from '../data/sync/backup';
import { useDb } from '../hooks/useDb';
import type { FinishPayload } from './ExecuteScreen';
import { typeLabel } from '../lib/workoutTypes';

interface FinishScreenProps {
  payload: FinishPayload;
  onDone: () => void;
  onRetry: () => void;
  onOpenHistory: () => void;
  onOpenTemplates: () => void;
}

type Dialog = 'idle' | 'naming' | 'saving' | 'error' | 'saved';

export function FinishScreen({ payload, onDone, onRetry, onOpenHistory, onOpenTemplates }: FinishScreenProps) {
  const { db } = useDb();
  const { workout, sets } = payload;
  const total = workout.entries.length;
  const skippedFlags = payload.skippedExercises;
  const completed = sets.filter(
    (group, ex) => skippedFlags?.[ex] !== true && group.length > 0 && group.every((s) => s.done),
  ).length;
  const doneSets = sets.reduce((sum, group, ex) => sum + (skippedFlags?.[ex] ? 0 : group.filter(set => set.done).length), 0);
  const partial = completed > 0 && completed < total;
  const duration = formatDurationMs(payload.durationMs ?? payload.endedAt - payload.startedAt);
  const date = formatDate(new Date(payload.endedAt));
  const [dialog, setDialog] = useState<Dialog>('idle');
  const [name, setName] = useState<string>(typeLabel(workout.type));
  const [backup, setBackup] = useState<{ text: string; tone: 'ok' | 'error' }>();
  const modal = useRef<HTMLDivElement>(null);
  useDialogFocus(modal, dialog !== 'idle', () => { if (dialog !== 'saving') setDialog('idle'); }, dialog);

  const downloadBackup = async () => {
    if (db === undefined) return;
    setBackup(undefined);
    try {
      await downloadLocalBackup(db);
      setBackup({ text: 'Резервная копия скачана.', tone: 'ok' });
    } catch {
      setBackup({ text: 'Не удалось создать резервную копию. Попробуй ещё раз.', tone: 'error' });
    }
  };

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
        <h1 className="topbar__title topbar__title--step" id="finish-title">Итог тренировки</h1>
      </header>

      <div
        className="screen__body"
        role="region"
        aria-labelledby="finish-title"
        tabIndex={0}
      >
        <div className="finish-hero">
          <span className="finish-hero__lead">{partial ? 'Результат сохранён' : 'Тренировка засчитана'}</span>
          <span className="finish-hero__score">
            {doneSets}
            <span className="finish-hero__unit">{pluralForm(doneSets, ['подход', 'подхода', 'подходов'])}</span>
          </span>
          <span className="finish-hero__caption">
            {completed} из {plural(total, ['упражнения', 'упражнений', 'упражнений'])}
            <span aria-hidden> · </span>
            {duration}
          </span>
          <span className="finish-hero__meta">{date}</span>
        </div>

        {payload.saved && <p className="finish-recap__note">Занятие сохранено на устройстве. Его можно повторить с главного экрана.</p>}

        {partial && (
          <div className="note">
            Неполные и пропущенные упражнения останутся в истории, но не попадут
            в статистику. Это нормально — следующая тренировка будет легче.
          </div>
        )}

        {payload.saved === false && (
          <div className="note note--error" role="alert">
            Запись не сохранилась в историю. Вернись к тренировке и повтори сохранение —
            введённые подходы останутся на месте.
          </div>
        )}

        <ul className="finish-list">
          {workout.entries.map((entry, ex) => {
            const group = sets[ex] ?? [];
            const skipped = skippedFlags?.[ex] === true;
            const done = !skipped && group.length > 0 && group.every((s) => s.done);
            const status = done ? 'done' : skipped ? 'skip' : 'partial';
            const statusLabel = done ? 'Выполнено' : skipped ? 'Пропущено' : 'Не завершено';
            return (
              <li key={entry.slotKey} className="finish-ex">
                <div className="finish-ex__head">
                  <span className="finish-ex__name">{entry.exercise.name}</span>
                  <span className={`finish-tag finish-tag--${status}`}>
                    {statusLabel}
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
                        {setDone ? set.weight ? `${set.weight}×${set.reps}` : `${set.reps} повт.` : '—'}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="screen__cta">
        {payload.saved === false ? (
          <>
            <button className="btn btn--primary" onClick={onRetry}>
              Вернуться к тренировке
            </button>
            <button className="btn btn--ghost" onClick={() => void downloadBackup()} disabled={db === undefined}>
              Скачать резервную копию
            </button>
            {backup !== undefined && <p className={backup.tone === 'error' ? 'body-error' : 'body-muted'} role={backup.tone === 'error' ? 'alert' : 'status'}>{backup.text}</p>}
          </>
        ) : (
          <>
            <button className="btn btn--primary" onClick={onDone}>
              Готово
            </button>
            <button className="btn btn--ghost" onClick={() => setDialog('naming')}>
              Сохранить как шаблон
            </button>
            <button className="text-action finish-history-link" onClick={onOpenHistory}>
              Перейти в историю
            </button>
          </>
        )}
      </div>

      {dialog === 'naming' && (
        <div className="overlay">
          <div ref={modal} className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title">
            <h2 id="save-title" className="dialog__title">
              Сохранить как шаблон
            </h2>
            <p className="dialog__text">
              Состав появится в разделе «Тренировки → Сохранённые» для быстрого старта.
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
              <button className="btn btn--primary" onClick={() => void save()} disabled={!name.trim()}>
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
          <div ref={modal} className="dialog" role="dialog" aria-modal="true" aria-label="Сохраняем шаблон">
            <h2 className="dialog__title">Сохраняем шаблон…</h2>
          </div>
        </div>
      )}

      {dialog === 'error' && (
        <div className="overlay">
          <div ref={modal} className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-error">
            <h2 id="save-error" className="dialog__title">
              Не удалось сохранить
            </h2>
            <p className="dialog__text">
              Не удалось записать шаблон на устройстве. Название сохранено — попробуй ещё раз.
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
          <div ref={modal} className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-done">
            <h2 id="save-done" className="dialog__title">
              Шаблон сохранён
            </h2>
            <p className="dialog__text">
              «{name.trim()}» теперь в разделе «Тренировки → Сохранённые».
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
