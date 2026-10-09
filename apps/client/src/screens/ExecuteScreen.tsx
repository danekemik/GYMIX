import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedWorkout } from '@gymix/generator';
import { plural } from '../lib/draft';

export interface SetEntry {
  readonly weight: string;
  readonly reps: string;
  readonly done: boolean;
}

/** Снимок выполненной сессии для экрана итога (S12). */
export interface FinishPayload {
  readonly workout: GeneratedWorkout;
  readonly sets: readonly (readonly SetEntry[])[];
  readonly startedAt: number;
  readonly endedAt: number;
}

interface ExecuteScreenProps {
  workout: GeneratedWorkout;
  onFinish: (payload: FinishPayload) => void;
  onExit: () => void;
}

type Modal = 'exit' | 'finish' | null;

const DEFAULT_SETS = 3;

export function ExecuteScreen({ workout, onFinish, onExit }: ExecuteScreenProps) {
  const [sets, setSets] = useState<SetEntry[][]>(() =>
    workout.entries.map(() => makeSets(DEFAULT_SETS)),
  );
  const [modal, setModal] = useState<Modal>(null);
  const startedAt = useRef(Date.now());

  const total = workout.entries.length;
  const completed = useMemo(
    () => sets.filter((group) => group.length > 0 && group.every((s) => s.done)).length,
    [sets],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const update = (ex: number, set: number, patch: Partial<SetEntry>) => {
    setSets((prev) =>
      prev.map((group, i) =>
        i === ex ? group.map((s, j) => (j === set ? { ...s, ...patch } : s)) : group,
      ),
    );
  };

  const addSet = (ex: number) => {
    setSets((prev) => prev.map((group, i) => (i === ex ? [...group, makeSet()] : group)));
  };

  const finish = () => {
    // LOCKED (2026-10-05): при 0 выполненных упражнений «Завершить» показывает
    // предупреждение — пустая сессия не засчитывается, кнопки «всё равно» нет.
    if (completed === 0) {
      setModal('finish');
      return;
    }
    onFinish({ workout, sets, startedAt: startedAt.current, endedAt: Date.now() });
  };

  return (
    <div className="screen exec">
      <header className="topbar">
        <button className="topbar__back" onClick={() => setModal('exit')} aria-label="Выйти из тренировки">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Выполнение</h1>
      </header>

      <div className="exec-progress">
        <span className="exec-progress__label">
          Выполнено {completed} из {total}
        </span>
        <span className="progress__track" aria-hidden>
          <span className="progress__bar" style={{ width: `${(completed / total) * 100}%` }} />
        </span>
      </div>

      <div className="exec-body">
        {workout.entries.map((entry, ex) => {
          const group = sets[ex] ?? [];
          const isDone = group.length > 0 && group.every((s) => s.done);
          return (
            <article key={entry.slotKey} className={`exec-card ${isDone ? 'exec-card--done' : ''}`}>
              <div className="exec-card__head">
                <span className="exec-card__group">{entry.groupUsed}</span>
                <span className="exec-card__name">{entry.exercise.name}</span>
              </div>

              <ul className="set-list">
                {group.map((set, index) => (
                  <li key={index} className="set-row">
                    <span className="set-row__num">{index + 1}</span>
                    <label className="set-field">
                      <span className="set-field__label">кг</span>
                      <input
                        className="set-input"
                        type="text"
                        inputMode="decimal"
                        value={set.weight}
                        onChange={(e) => update(ex, index, { weight: e.target.value })}
                      />
                    </label>
                    <label className="set-field">
                      <span className="set-field__label">повт.</span>
                      <input
                        className="set-input"
                        type="text"
                        inputMode="numeric"
                        value={set.reps}
                        onChange={(e) => update(ex, index, { reps: e.target.value })}
                      />
                    </label>
                    <button
                      className={`set-check ${set.done ? 'set-check--on' : ''}`}
                      aria-pressed={set.done}
                      aria-label={`Подход ${index + 1} выполнен`}
                      onClick={() => update(ex, index, { done: !set.done })}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>

              <button className="exec-card__add" onClick={() => addSet(ex)}>
                Добавить подход
              </button>
            </article>
          );
        })}
      </div>

      <div className="exec-footer">
        <span className="exec-footer__hint">
          {plural(completed, ['упражнение', 'упражнения', 'упражнений'])} готово
        </span>
        <button className="btn btn--primary exec-footer__cta" onClick={finish}>
          Завершить
        </button>
      </div>

      {modal !== null && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <h2 id="dialog-title" className="dialog__title">
              {modal === 'finish' ? 'Тренировка не будет засчитана' : 'Прервать тренировку?'}
            </h2>
            <p className="dialog__text">
              {modal === 'finish'
                ? 'Ни одно упражнение не выполнено. Пустая сессия не попадёт в историю.'
                : 'Текущий прогресс не будет сохранён.'}
            </p>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => setModal(null)} autoFocus>
                Продолжить тренировку
              </button>
              <button className="btn btn--ghost dialog__danger" onClick={onExit}>
                {modal === 'finish' ? 'Удалить тренировку' : 'Выйти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function makeSet(): SetEntry {
  return { weight: '', reps: '', done: false };
}

function makeSets(count: number): SetEntry[] {
  return Array.from({ length: count }, makeSet);
}