import { RestTimer } from '../components/RestTimer';
import { queryPreviousSets } from '../data/local/read-rpc';
import { workoutReadOnly } from '../data/sync/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedWorkout } from '@gymix/generator';
import { useDb } from '../hooks/useDb';
import { plural } from '../lib/draft';
import { createDraft, deleteDraft, persistDraft, setDraftRunning, type DraftSession, type ResumedSession } from '../lib/session';
import { finishDraft } from '../lib/session';

import type { SetEntry, SessionSnapshot, FinishPayload } from '../domain/session';
export type { SetEntry, SessionSnapshot, FinishPayload } from '../domain/session';

interface ExecuteScreenProps {
  workout: GeneratedWorkout;
  onFinish: (payload: FinishPayload) => void;
  onExit: () => void;
  /** Восстановление активной сессии (S11): ничего не создаём заново. */
  resume?: ResumedSession;
}

type Modal = 'exit' | 'finish' | 'skip-exercise' | 'skip-group' | null;

const DEFAULT_SETS = 3;
const AUTOSAVE_DELAY = 0;
const TOAST_HIDE_DELAY = 1600;

/** Общий таймер: mm:ss, при часе и более — h:mm:ss. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ExecuteScreen({ workout, onFinish, onExit, resume }: ExecuteScreenProps) {
  const { db, revision } = useDb();
  const [readOnly, setReadOnly] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sets, setSets] = useState<SetEntry[][]>(() =>
    resume !== undefined
      ? resume.sets.map((group) => group.map((set) => ({ ...set })))
      : workout.entries.map(() => makeSets(DEFAULT_SETS)),
  );
  const [skipped, setSkipped] = useState<boolean[]>(() =>
    resume !== undefined ? [...resume.skipped] : workout.entries.map(() => false),
  );
  const [modal, setModal] = useState<Modal>(null);
  const [skipIndex, setSkipIndex] = useState(0);
  const [lastCompleted, setLastCompleted] = useState<{ ex: number; set: number; } | null>(null);
  const [focused, setFocused] = useState(() => resume ? Math.max(0, resume.sets.findIndex((group, ex) => !resume.skipped[ex] && !group.every(set => set.done))) : 0);
  const [previous, setPrevious] = useState<Map<string, SetEntry[]>>(new Map());
  const [prefilled, setPrefilled] = useState(false);
  const [toast, setToast] = useState<'ok' | 'error' | null>(null);
  const startedAt = useRef<number>(resume?.startedAt ?? Date.now());
  const [draft, setDraft] = useState<DraftSession | 'created' | null>(resume ?? null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Общий таймер (S10, LOCKED): сумма активных интервалов; паузы не идут
  // в длительность. Идёт по часам устройства и продолжается в фоне.
  const [running, setRunning] = useState(resume?.running ?? true);
  const accumulatedRef = useRef(resume?.elapsedMs ?? 0);
  const intervalStartRef = useRef<number | null>(
    resume === undefined
      ? Date.now()
      : resume.running
        ? (resume.openSince ?? Date.now())
        : null,
  );
  const [, setTick] = useState(0);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const elapsedMs = () =>
    accumulatedRef.current +
    (intervalStartRef.current !== null ? Date.now() - intervalStartRef.current : 0);

  useEffect(() => {
    if (!running) return;
    const handle = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(handle);
  }, [running]);

  const togglePause = () => {
    const now = Date.now();
    if (running) {
      if (intervalStartRef.current !== null) {
        accumulatedRef.current += now - intervalStartRef.current;
      }
      intervalStartRef.current = null;
      setRunning(false);
      if (draft !== null && draft !== 'created' && db !== undefined) {
        void setDraftRunning(db, draft.sessionId, false).catch(() => { });
      }
    } else {
      intervalStartRef.current = now;
      setRunning(true);
      if (draft !== null && draft !== 'created' && db !== undefined) {
        void setDraftRunning(db, draft.sessionId, true).catch(() => { });
      }
    }
  };

  const total = workout.entries.length;
  const isDone = (group: readonly SetEntry[]) => group.length > 0 && group.every((s) => s.done);
  const completed = useMemo(
    () => sets.filter((group, ex) => !skipped[ex] && isDone(group)).length,
    [sets, skipped],
  );

  const savingRef = useRef<Promise<void> | null>(null);
  const saveAgain = useRef(false);
  const finishingRef = useRef(false);
  const latestInput = useRef({ sets, skipped });
  latestInput.current = { sets, skipped };
  const persist = async () => {
    if (draft === null || draft === 'created' || db === undefined || finishing || readOnly) return;
    if (savingRef.current) { saveAgain.current = true; return savingRef.current.catch(() => undefined); }
    const save = async () => {
      do {
        saveAgain.current = false;
        const latest = latestInput.current;
        await persistDraft(db, draft.sessionId, draft.byPosition, latest.sets, latest.skipped);
      } while (saveAgain.current && !finishingRef.current);
    };
    const pending = save();
    savingRef.current = pending;
    try {
      await pending;
      setToast('ok');
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), TOAST_HIDE_DELAY);
    } catch {
      setToast('error');
    } finally { if (savingRef.current === pending) savingRef.current = null; }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (resume !== undefined || db === undefined) return;
    let alive = true;
    createDraft(db, workout)
      .then(async (created) => {
        if (!alive) return;
        setDraft(created);
        const previous = await queryPreviousSets(db, workout.entries.map(entry => entry.exercise.name)).catch(() => new Map());
        if (!alive || !previous.size) return;
        setPrevious(previous);
        setSets(current => current.map((group, ex) => group.map((set, index) => {
          const suggestion = previous.get(workout.entries[ex]!.exercise.name)?.[index];
          return suggestion && !set.done && set.weight === '' && set.reps === '' ? { ...suggestion } : set;
        })));
        setPrefilled(true);
      })
      .catch(() => { if (alive) setToast('error'); });
    return () => {
      alive = false;
    };
  }, [db, workout, resume]);

  useEffect(() => {
    if (!resume || !db) return;
    let alive = true;
    queryPreviousSets(db, workout.entries.map(entry => entry.exercise.name)).then(value => { if (alive) setPrevious(value); }).catch(() => {});
    return () => { alive = false; };
  }, [db, workout, resume]);

  useEffect(() => {
    if (draft === null || draft === 'created' || db === undefined) return;
    const handle = setTimeout(() => {
      void persistRef.current();
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(handle);
  }, [sets, skipped, draft, db, finishing, readOnly]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

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

  const skipExercise = (ex: number) =>
    setSkipped((prev) => prev.map((value, i) => (i === ex ? true : value)));
  const unskipExercise = (ex: number) =>
    setSkipped((prev) => prev.map((value, i) => (i === ex ? false : value)));
  const skipGroup = (groupUsed: string) =>
    setSkipped((prev) =>
      prev.map((value, i) => (workout.entries[i]?.groupUsed === groupUsed ? true : value)),
    );

  const goNext = (from: number) => {
    for (let step = 1; step <= total; step++) {
      const i = (from + step) % total;
      if (!(skipped[i] === true) && !isDone(sets[i] ?? [])) {
        setFocused(i);
        window.requestAnimationFrame(() => {
          cardRefs.current[i]?.scrollIntoView({ behavior: 'auto', block: 'start' });
          cardRefs.current[i]?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        });
        return;
      }
    }
  };

  const deleteDraftNow = async () => {
    if (draft !== null && draft !== 'created' && db !== undefined) {
      await deleteDraft(db, draft.sessionId).catch(() => { });
    }
    onExit();
  };

  const finish = async () => {
    // LOCKED (2026-10-05): при 0 выполненных упражнений «Завершить» показывает
    // предупреждение — пустая сессия не засчитывается, кнопки «всё равно» нет.
    if (completed === 0) {
      setModal('finish');
      return;
    }
    const payload: SessionSnapshot = {
      workout,
      sets,
      skippedExercises: skipped,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      durationMs: elapsedMs(),
    };
    if (!db || !draft || draft === 'created' || finishing || readOnly) { setToast('error'); return; }
    finishingRef.current = true;
    setFinishing(true);
    try {
      await savingRef.current?.catch(() => undefined);
      await finishDraft(db, draft, payload);
      onFinish({ ...payload, saved: true });
    } catch { setToast('error'); }
    finally { finishingRef.current = false; setFinishing(false); }

  };

  useEffect(() => {
    if (!db || !draft || draft === 'created') return;
    let alive = true;
    void workoutReadOnly(db, `workout:${draft.sessionId}`).then(locked => { if (alive) setReadOnly(locked); }).catch(() => { if (alive) setToast('error'); });
    return () => { alive = false; };
  }, [db, draft, revision]);

  return (
    <div className="screen exec">
      {readOnly && <button className="btn btn--ghost" onClick={onExit}>На главный экран</button>}
      {readOnly && <p role="alert">Тренировка продолжена на другом устройстве или завершена. Ввод сохранён локально. Вернитесь на главный экран.</p>}
      <fieldset disabled={readOnly || finishing} style={{ display: 'contents', border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <header className="topbar exec-top">
          <button className="topbar__back" onClick={() => setModal('exit')} aria-label="Выйти из тренировки">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="topbar__title exec-clock" aria-label="Длительность тренировки">
            {formatClock(elapsedMs())}
          </h1>
          <button
            className={`topbar__icon-btn exec-pause${running ? '' : ' exec-pause--off'}`}
            onClick={togglePause}
            aria-pressed={!running}
            aria-label={running ? 'Пауза' : 'Продолжить'}
          >
            {running ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" />
              </svg>
            )}
          </button>
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
          <RestTimer sessionId={draft && draft !== 'created' ? draft.sessionId : undefined} />
          {prefilled && <p className="exec-prefill">Прошлые значения подставлены — их можно изменить.</p>}
          <p className="exec-roster-label">Упражнения · {total}</p>
          {workout.entries.map((entry, ex) => {
            const group = sets[ex] ?? [];
            const skippedHere = skipped[ex] === true;
            const done = isDone(group);
            const state = skippedHere ? 'skipped' : done ? 'done' : 'active';
            const open = focused === ex;
            const past = previous.get(entry.exercise.name);
            const groupSize = workout.entries.filter((e) => e.groupUsed === entry.groupUsed).length;
            return (
              <article
                key={entry.slotKey}
                ref={(el) => {
                  cardRefs.current[ex] = el;
                }}
                className={`exec-card exec-card--${state}`}
              >
                <h2 className="exec-card__heading"><button className="exec-card__toggle" aria-expanded={open} aria-controls={`exercise-${ex}`} onClick={() => setFocused(open ? -1 : ex)}>
                  <span className="exec-card__ordinal" aria-hidden="true">{String(ex + 1).padStart(2, '0')}</span>
                  <span className="exec-card__head">
                    <span className="exec-card__group">{entry.groupUsed} · {skippedHere ? 'Пропущено' : done ? 'Выполнено' : open ? 'Сейчас' : `${group.filter(set => set.done).length}/${group.length} подходов`}</span>
                    <span className="exec-card__name">{entry.exercise.name}</span>
                  </span><span className="exec-card__chevron" aria-hidden="true">{open ? '−' : '+'}</span>
                </button></h2>

                <div id={`exercise-${ex}`} hidden={!open} className="exec-card__content">
                {skippedHere ? (
                  <button
                    className="btn btn--ghost btn--sm exec-card__return"
                    onClick={() => unskipExercise(ex)}
                  >
                    Вернуть упражнение
                  </button>
                ) : (
                  <>
                    <div className="set-columns" aria-hidden="true"><span>№</span><span>кг</span><span>повт.</span><span>Готово</span></div>
                    <ul className="set-list">
                      {group.map((set, index) => (
                        <li key={index} className={`set-row${!set.done && index === group.findIndex(item => !item.done) ? ' set-row--current' : ''}`}>
                          <span className="set-row__num">{index + 1}</span>
                          <label className="set-field">
                            <span className="set-field__label">кг</span>
                            <input
                              className="set-input"
                              type="text"
                              inputMode="decimal"
                              aria-label={`Вес, подход ${index + 1}, ${entry.exercise.name}`}
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
                              aria-label={`Повторения, подход ${index + 1}, ${entry.exercise.name}`}
                              value={set.reps}
                              onChange={(e) => update(ex, index, { reps: e.target.value })}
                            />
                          </label>
                          <button
                            className={`set-check ${set.done ? 'set-check--on' : ''}`}
                            aria-pressed={set.done}
                            aria-label={`Подход ${index + 1} выполнен`}
                            onClick={() => {
                              update(ex, index, { done: !set.done });
                              setLastCompleted(set.done ? null : { ex, set: index });
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          {past?.[index] && <span className="set-row__previous">Ранее: {past[index]!.weight || '—'} кг × {past[index]!.reps || '—'} повт.</span>}
                        </li>
                      ))}
                    </ul>

                    <div className="exec-card__actions">
                      <button className="exec-card__add" onClick={() => addSet(ex)}>
                        Добавить подход
                      </button>
                      <button className="exec-card__next" onClick={() => goNext(ex)}>
                        Следующее
                      </button>
                      <button
                        className="exec-card__skip"
                        onClick={() => {
                          setSkipIndex(ex);
                          setModal('skip-exercise');
                        }}
                      >
                        Пропустить упражнение
                      </button>
                      {groupSize > 1 && (
                        <button
                          className="exec-card__skip"
                          onClick={() => {
                            setSkipIndex(ex);
                            setModal('skip-group');
                          }}
                        >
                          Пропустить группу
                        </button>
                      )}
                    </div>
                  </>
                )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="exec-footer">
          {lastCompleted && <div className="exec-undo" role="status">Подход {lastCompleted.set + 1} отмечен
            <button type="button" onClick={() => {
              update(lastCompleted.ex, lastCompleted.set, { done: false }); setLastCompleted(null);
            }}>Отменить</button>
          </div>}
          <span className="exec-footer__hint">
            {plural(completed, ['упражнение', 'упражнения', 'упражнений'])} готово
          </span>
          <button className="btn btn--primary exec-footer__cta" onClick={finish}>
            {finishing ? 'Сохраняем…' : 'Завершить'}
          </button>
        </div>

        {toast !== null && (
          <div
            className={`autosave-toast ${toast === 'error' ? 'autosave-toast--error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {toast === 'ok' ? (
              'Сохранено'
            ) : (
              <>
                <span>Не удалось сохранить</span>
                <button className="autosave-toast__retry" onClick={() => void persist()}>
                  Повторить
                </button>
              </>
            )}
          </div>
        )}

        {modal !== null && (() => {
          const targetName = workout.entries[skipIndex]?.exercise.name ?? '';
          const targetGroup = workout.entries[skipIndex]?.groupUsed ?? '';
          const isSkip = modal === 'skip-exercise' || modal === 'skip-group';
          const title =
            modal === 'finish'
              ? 'Тренировка не будет засчитана'
              : modal === 'skip-exercise'
                ? 'Пропустить упражнение?'
                : modal === 'skip-group'
                  ? 'Пропустить группу?'
                  : 'Выйти из тренировки?';
          const text =
            modal === 'finish'
              ? 'Ни одно упражнение не выполнено. Пустая сессия не попадёт в историю.'
              : modal === 'skip-exercise'
                ? `«${targetName}» не засчитается в итоге. Вернуть его можно в любой момент.`
                : modal === 'skip-group'
                  ? `Все упражнения группы «${targetGroup}» в этой тренировке будут пропущены.`
                  : 'Прогресс сохранится — продолжить можно будет с главного экрана.';
          return (
            <div className="overlay">
              <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
                <h2 id="dialog-title" className="dialog__title">
                  {title}
                </h2>
                <p className="dialog__text">{text}</p>
                <div className="dialog__actions">
                  {isSkip ? (
                    <>
                      <button
                        className="btn btn--primary"
                        autoFocus
                        onClick={() => {
                          if (modal === 'skip-exercise') skipExercise(skipIndex);
                          else skipGroup(targetGroup);
                          setModal(null);
                        }}
                      >
                        Пропустить
                      </button>
                      <button className="btn btn--ghost" onClick={() => setModal(null)}>
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn--primary" onClick={() => setModal(null)} autoFocus>
                        Продолжить тренировку
                      </button>
                      <button
                        className="btn btn--ghost dialog__danger"
                        onClick={modal === 'finish' ? () => void deleteDraftNow() : onExit}
                      >
                        {modal === 'finish' ? 'Удалить тренировку' : 'Сохранить и выйти'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </fieldset>
    </div>
  );
}

function makeSet(): SetEntry {
  return { weight: '', reps: '', done: false };
}

function makeSets(count: number): SetEntry[] {
  return Array.from({ length: count }, makeSet);
}