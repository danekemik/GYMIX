import { RestTimer } from '../components/RestTimer';
import { queryPreviousSets, queryReadModel } from '../data/local/read-rpc';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedWorkout } from '@gymix/generator';
import { useDb } from '../hooks/useDb';
import { plural } from '../lib/draft';
import { deleteDraft, persistDraft, setDraftRunning, type DraftSession, type ResumedSession } from '../lib/session';
import { finishDraft } from '../lib/session';
import { SaveQueue } from '../lib/saveQueue';
import { setInputErrors, validSetInput } from '../domain/setInput';
import { ExerciseDetail } from '../components/ExerciseDetail';
import type { CatalogExercise } from '@gymix/catalog/parse';
import { useDialogFocus } from '../hooks/useDialogFocus';

import type { SetEntry, SessionSnapshot, FinishPayload } from '../domain/session';
export type { SetEntry, SessionSnapshot, FinishPayload } from '../domain/session';

interface ExecuteScreenProps {
  workout: GeneratedWorkout;
  prepared: DraftSession;
  onFinish: (payload: FinishPayload) => void;
  onExit: () => void;
  /** Восстановление активной сессии (S11): ничего не создаём заново. */
  resume?: ResumedSession;
}

type Modal = 'exit' | 'finish' | 'partial-finish' | 'skip-exercise' | 'skip-group' | null;

const DEFAULT_SETS = 3;
const AUTOSAVE_DELAY = 250;
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

export function ExecuteScreen({ workout, prepared, onFinish, onExit, resume }: ExecuteScreenProps) {
  const { db, revision } = useDb();
  const [readOnly, setReadOnly] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [pausing, setPausing] = useState(false);
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
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(new Set());
  const [removedSet, setRemovedSet] = useState<{ ex: number; index: number; value: SetEntry } | null>(null);
  const [detail, setDetail] = useState<CatalogExercise | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, modal !== null, () => { if (!finishing && !exiting) setModal(null); });
  const [focused, setFocused] = useState(() => resume ? Math.max(0, resume.sets.findIndex((group, ex) => !resume.skipped[ex] && !group.every(set => set.done))) : 0);
  const [previous, setPrevious] = useState<Map<string, SetEntry[]>>(new Map());
  const [prefilled, setPrefilled] = useState(false);
  const [toast, setToast] = useState<'ok' | 'error' | null>(null);
  const startedAt = useRef<number>(resume?.startedAt ?? Date.now());
  const draft = prepared;
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

  const timerWrite = useRef<Promise<void> | undefined>(undefined);
  const togglePause = () => {
    if (!db || pausing) return;
    const now = Date.now();
    const before = { accumulated: accumulatedRef.current, start: intervalStartRef.current };
    if (running) {
      if (intervalStartRef.current !== null) {
        accumulatedRef.current += now - intervalStartRef.current;
      }
      intervalStartRef.current = null;
      setRunning(false);
    } else {
      intervalStartRef.current = now;
      setRunning(true);
    }
    setPausing(true);
    timerWrite.current = setDraftRunning(db, draft.sessionId, !running, now).catch(() => {
      accumulatedRef.current = before.accumulated;
      intervalStartRef.current = before.start;
      setRunning(running);
      setToast('error');
    }).finally(() => setPausing(false));
  };

  const total = workout.entries.length;
  const isDone = (group: readonly SetEntry[]) => group.length > 0 && group.every((s) => s.done);
  const completed = useMemo(
    () => sets.filter((group, ex) => !skipped[ex] && isDone(group)).length,
    [sets, skipped],
  );
  const doneSets = sets.reduce((sum, group, ex) => sum + (skipped[ex] ? 0 : group.filter(set => set.done).length), 0);
  const totalSets = sets.reduce((sum, group) => sum + group.length, 0);

  const finishingRef = useRef(false);
  const input = useMemo(() => ({ sets, skipped }), [sets, skipped]);
  const latestInput = useRef(input);
  latestInput.current = input;
  const saveQueue = useMemo(() => new SaveQueue<typeof input>(value => {
    if (!db) throw new Error('Локальная база недоступна');
    return persistDraft(db, draft.sessionId, draft.byPosition, value.sets, value.skipped);
  }), [db, draft]);
  const persist = async () => {
    if (!db || readOnly) return false;
    saveQueue.update(latestInput.current);
    try {
      await saveQueue.flush();
      setToast('ok');
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), TOAST_HIDE_DELAY);
      return true;
    } catch {
      setToast('error');
      return false;
    }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    if (resume !== undefined || db === undefined) return;
    let alive = true;
    void (async () => {
        const previous = await queryPreviousSets(db, workout.entries.map(entry => entry.exercise.name)).catch(() => new Map());
        if (!alive || !previous.size) return;
        setPrevious(previous);
        setSets(current => current.map((group, ex) => group.map((set, index) => {
          const suggestion = previous.get(workout.entries[ex]!.exercise.name)?.[index];
          return suggestion && !set.done && set.weight === '' && set.reps === '' ? { ...suggestion } : set;
        })));
        setPrefilled(true);
      })()
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
    if (!db || finishingRef.current || readOnly || exiting) return;
    const handle = setTimeout(() => {
      void persistRef.current();
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(handle);
  }, [sets, skipped, draft, db, finishing, readOnly, exiting]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const update = (ex: number, set: number, patch: Partial<SetEntry>) => {
    setSets((prev) =>
      prev.map((group, i) =>
        i === ex ? group.map((s, j) => {
          if (j !== set) return s;
          const next = { ...s, ...patch };
          return next.done && !validSetInput(next) ? { ...next, done: false } : next;
        }) : group,
      ),
    );
  };

  const addSet = (ex: number) => {
    setSets((prev) => prev.map((group, i) => (i === ex ? [...group, makeSet()] : group)));
  };
  const removeSet = (ex: number, index: number) => {
    const value = sets[ex]?.[index];
    if (!value || index < DEFAULT_SETS) return;
    setRemovedSet({ ex, index, value });
    setLastCompleted(null);
    setAttempted(new Set());
    setSets(current => current.map((group, i) => i === ex ? group.filter((_, j) => j !== index) : group));
  };
  const restoreSet = () => {
    if (!removedSet) return;
    const { ex, index, value } = removedSet;
    setSets(current => current.map((group, i) => i === ex ? [...group.slice(0, index), value, ...group.slice(index)] : group));
    setRemovedSet(null);
    setLastCompleted(null);
    setAttempted(new Set());
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
    if (!db || exiting) return;
    setExiting(true); finishingRef.current = true;
    try {
      await saveQueue.flush();
      await timerWrite.current;
      await deleteDraft(db, draft.sessionId);
      onExit();
    } catch { setToast('error'); }
    finally { setExiting(false); finishingRef.current = false; }
  };

  const saveAndExit = async () => {
    if (exiting || finishing) return;
    setExiting(true);
    try {
      await timerWrite.current;
      if (await persist()) onExit();
    } finally { setExiting(false); }
  };

  const finish = async (confirmedPartial = false) => {
    if (finishingRef.current) return;
    const invalid = sets.flatMap((group, ex) => skipped[ex] ? [] : group.flatMap((set, index) => set.done && !validSetInput(set) ? [{ ex, index }] : []));
    if (invalid.length) {
      setAttempted(new Set(invalid.map(({ ex, index }) => `${ex}:${index}`)));
      setFocused(invalid[0]!.ex);
      return;
    }
    // LOCKED (2026-10-05): при 0 выполненных упражнений «Завершить» показывает
    // предупреждение — пустая сессия не засчитывается, кнопки «всё равно» нет.
    if (completed === 0) {
      setModal('finish');
      return;
    }
    if (completed < total && !confirmedPartial) { setModal('partial-finish'); return; }
    const payload: SessionSnapshot = {
      workout,
      sets,
      skippedExercises: skipped,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      durationMs: elapsedMs(),
    };
    if (!db || finishing || readOnly) { setToast('error'); return; }
    finishingRef.current = true;
    setFinishing(true);
    try {
      await timerWrite.current;
      await saveQueue.flush();
      await finishDraft(db, draft, payload);
      onFinish({ ...payload, saved: true });
    } catch { setToast('error'); }
    finally { finishingRef.current = false; setFinishing(false); }

  };

  useEffect(() => {
    if (!db) return;
    let alive = true;
    void queryReadModel<boolean>(db, `ownership:${draft.sessionId}`).then(locked => { if (alive) setReadOnly(locked); }).catch(() => { if (alive) setToast('error'); });
    return () => { alive = false; };
  }, [db, draft, revision]);

  return (
    <div className="screen exec">
      {readOnly && <button className="btn btn--ghost" onClick={onExit}>На главный экран</button>}
      {readOnly && <p role="alert">Тренировка продолжена на другом устройстве или завершена. Ввод сохранён локально. Вернитесь на главный экран.</p>}
      <fieldset disabled={readOnly || finishing || exiting} style={{ display: 'contents', border: 0, margin: 0, padding: 0, minWidth: 0 }}>
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
            disabled={pausing}
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
            <span>Упражнения: {completed} из {total}</span><span>{doneSets} из {totalSets} подходов</span>
          </span>
          <span className="progress__track" aria-hidden>
            <span className="progress__bar" style={{ width: `${(completed / total) * 100}%` }} />
          </span>
        </div>

        <div className="exec-body">
          <RestTimer sessionId={draft.sessionId} />
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
                    <button className="text-action exec-detail-button" onClick={() => setDetail(entry.exercise)}>Подробнее об упражнении</button>
                    <div className="set-columns" aria-hidden="true"><span>№</span><span>кг</span><span>повт.</span><span>Готово</span></div>
                    <p className="set-input-hint">Без дополнительного веса — оставь «кг» пустым.</p>
                    <ul className="set-list">
                      {group.map((set, index) => {
                        const errors = setInputErrors(set);
                        const showErrors = attempted.has(`${ex}:${index}`);
                        const errorId = `set-error-${ex}-${index}`;
                        return (
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
                              aria-invalid={showErrors && Boolean(errors.weight)}
                              aria-describedby={showErrors && errors.weight ? errorId : undefined}
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
                              aria-invalid={showErrors && Boolean(errors.reps)}
                              aria-describedby={showErrors && errors.reps ? errorId : undefined}
                              onChange={(e) => update(ex, index, { reps: e.target.value })}
                            />
                          </label>
                          <button
                            className={`set-check ${set.done ? 'set-check--on' : ''}`}
                            aria-pressed={set.done}
                            aria-label={`Подход ${index + 1} выполнен`}
                            onClick={event => {
                              if (!set.done && !validSetInput(set)) {
                                setAttempted(previous => new Set([...previous, `${ex}:${index}`]));
                                const row = event.currentTarget.closest('li');
                                requestAnimationFrame(() => row?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus());
                                return;
                              }
                              update(ex, index, { done: !set.done });
                              setLastCompleted(set.done ? null : { ex, set: index });
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          {showErrors && (errors.weight || errors.reps) && <span className="set-row__error" id={errorId} role="alert">{[errors.weight, errors.reps].filter(Boolean).join(' ')}</span>}
                          {past?.[index] && <span className="set-row__previous">Ранее: {past[index]!.weight ? `${past[index]!.weight} кг × ` : ''}{past[index]!.reps || '—'} повт.</span>}
                          {index >= DEFAULT_SETS && <button type="button" className="set-row__remove" onClick={() => removeSet(ex, index)} aria-label={`Убрать подход ${index + 1}: ${entry.exercise.name}`}>Убрать подход {index + 1}</button>}
                        </li>
                      ); })}
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
          {removedSet && <div className="exec-undo" role="status">Подход {removedSet.index + 1} убран <button type="button" onClick={restoreSet}>Вернуть</button></div>}
          {lastCompleted && <div className="exec-undo" role="status">Подход {lastCompleted.set + 1} отмечен
            <button type="button" onClick={() => {
              update(lastCompleted.ex, lastCompleted.set, { done: false }); setLastCompleted(null);
            }}>Отменить</button>
          </div>}
          <span className="exec-footer__hint">
            {plural(completed, ['упражнение', 'упражнения', 'упражнений'])} готово
          </span>
          <button className="btn btn--primary exec-footer__cta" onClick={() => void finish()}>
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
              : modal === 'partial-finish'
                ? 'Завершить частично?'
              : modal === 'skip-exercise'
                ? 'Пропустить упражнение?'
                : modal === 'skip-group'
                  ? 'Пропустить группу?'
                  : 'Выйти из тренировки?';
          const text =
            modal === 'finish'
              ? `Ни одно упражнение не завершено целиком. ${doneSets > 0 ? `Отмеченные подходы: ${doneSets} из ${totalSets}. ` : ''}Для записи в историю заверши хотя бы одно упражнение. Прогресс можно сохранить при выходе и продолжить позже.`
              : modal === 'partial-finish'
                ? `Завершено ${completed} из ${total} упражнений, отмечено ${doneSets} из ${totalSets} подходов. В статистику попадут только полностью выполненные упражнения. Остальные результаты сохранятся в истории без учёта в статистике.`
              : modal === 'skip-exercise'
                ? `«${targetName}» не засчитается в итоге. Вернуть его можно в любой момент.`
                : modal === 'skip-group'
                  ? `Все упражнения группы «${targetGroup}» в этой тренировке будут пропущены.`
                  : 'Прогресс сохранится — продолжить можно будет с главного экрана.';
          return (
            <div className="overlay">
              <div ref={dialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
                <h2 id="dialog-title" className="dialog__title">
                  {title}
                </h2>
                <p className="dialog__text">{text}</p>
                {toast === 'error' && <p className="body-error" role="alert">Не удалось сохранить. Ввод остался на экране — попробуй ещё раз.</p>}
                <div className="dialog__actions">
                  {modal === 'partial-finish' ? <>
                    <button className="btn btn--primary" onClick={() => void finish(true)}>{finishing ? 'Сохраняем…' : 'Сохранить результат'}</button>
                    <button className="btn btn--ghost" onClick={() => setModal(null)} autoFocus>Продолжить тренировку</button>
                  </> : isSkip ? (
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
                        onClick={modal === 'finish' ? () => void deleteDraftNow() : () => void saveAndExit()}
                      >
                        {exiting ? 'Сохраняем…' : modal === 'finish' ? 'Удалить тренировку' : 'Сохранить и выйти'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </fieldset>
      {detail && <ExerciseDetail exercise={detail} pickLabel="" excluded={false} onClose={() => setDetail(null)} />}
    </div>
  );
}

function makeSet(): SetEntry {
  return { weight: '', reps: '', done: false };
}

function makeSets(count: number): SetEntry[] {
  return Array.from({ length: count }, makeSet);
}
