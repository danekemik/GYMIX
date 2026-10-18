import { queryExcludedNames } from '../data/local/read-rpc';
import { typeLabel } from '../lib/workoutTypes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  replacementCandidates,
  slotFor,
  type GeneratedEntry,
  type GeneratedWorkout,
} from '@gymix/generator';
import type { CatalogExercise } from '@gymix/catalog/parse';
import { plural, type Draft } from '../lib/draft';
import { getCatalog } from '../lib/catalog';
import { useDb } from '../hooks/useDb';
import { excludeExerciseByName, includeExerciseByName } from '../lib/exclusions';
import { ExerciseDetail } from '../components/ExerciseDetail';

interface PreviewScreenProps {
  starting?: boolean;
  workout: GeneratedWorkout;
  draft: Draft;
  onStart: () => void;
  onRegenerate: () => void;
  onBack: () => void;
  /** Упражнение заменено в предпросмотре (S09). */
  onReplace: (index: number, exercise: CatalogExercise) => void;
  /** Порядок упражнений внутри групп изменён (S08). */
  onReorder: (entries: readonly GeneratedEntry[]) => void;
  /** Вернуться к ручному выбору упражнений (S08 → S06). */
  onEditSelection?: () => void;
  onEditParameters?: () => void;
  /** Шаблон не перегенерируется — упражнения зафиксированы. */
  regenerable?: boolean;
}

export function PreviewScreen({
  workout,
  starting = false,
  draft,
  onStart,
  onRegenerate,
  onBack,
  onReplace,
  onReorder,
  onEditSelection,
  onEditParameters,
  regenerable = true,
}: PreviewScreenProps) {
  const { db, revision } = useDb();
  const [replacing, setReplacing] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState<string | undefined>(undefined);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [detail, setDetail] = useState<CatalogExercise | null>(null);
  const [actionError, setActionError] = useState('');
  const [undoExclude, setUndoExclude] = useState<string>();

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    void queryExcludedNames(db)
      .then((names) => alive && setExcluded(new Set(names)))
      .catch(() => alive && setExcluded(new Set()));
    return () => {
      alive = false;
    };
  }, [db, revision]);

  const total = workout.entries.length;

  const current = replacing !== null ? workout.entries[replacing] : undefined;

  const candidates = useMemo(() => {
    if (db === undefined || current === undefined) return [];
    const slot = slotFor(current.slotKey, workout.type, workout.volume, draft.mgsGroup);
    const taken = new Set(
      workout.entries.map((e) => e.exercise.name).filter((n) => n !== current.exercise.name),
    );
    return replacementCandidates(getCatalog(), slot, current.exercise.name, excluded, taken);
  }, [current, workout, draft.mgsGroup, excluded, db]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return candidates;
    return candidates.filter(
      (c) => c.name.toLowerCase().includes(q) || c.primary.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const closeSheet = () => {
    setReplacing(null);
    setQuery('');
  };
  const replacementDialog = useRef<HTMLElement>(null);
  useDialogFocus(replacementDialog, replacing !== null, closeSheet);

  const toggleExclude = async (name: string, allowUndo = true) => {
    if (db === undefined || saving !== undefined) return;
    setSaving(name); setActionError('');
    try {
      if (excluded.has(name)) {
        await includeExerciseByName(db, name);
        const next = new Set(excluded);
        next.delete(name);
        setExcluded(next);
      } else {
        await excludeExerciseByName(db, name);
        const next = new Set(excluded);
        next.add(name);
        setExcluded(next);
      }
      setUndoExclude(allowUndo ? name : undefined);
    } catch {
      setActionError('Не удалось изменить исключение. Попробуй ещё раз.');
    } finally {
      setSaving(undefined);
    }
  };

  const canMove = (from: number, to: number) =>
    to >= 0 &&
    to < total &&
    workout.entries[from] !== undefined &&
    workout.entries[to] !== undefined &&
    workout.entries[from]!.groupUsed === workout.entries[to]!.groupUsed;

  const move = (from: number, to: number) => {
    if (!canMove(from, to)) return;
    const next = [...workout.entries];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onReorder(next);
  };

  return (
    <div className="screen">
      <fieldset disabled={starting} style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Состав тренировки</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{typeLabel(workout.type)}</span>
          <span className="volume-head__meta">
            {workout.volume} · {plural(total, ['упражнение', 'упражнения', 'упражнений'])}
          </span>
        </div>

        {actionError && <p className="body-error" role="alert">{actionError}</p>}
        {undoExclude && <p className="note" role="status">«{undoExclude}»: {excluded.has(undoExclude) ? 'исключено из будущих подборов' : 'снова доступно для подбора'}. <button className="text-action" disabled={saving !== undefined} onClick={() => void toggleExclude(undoExclude, false)}>Отменить</button></p>}
        {onEditSelection && <button className="text-action preview-edit" onClick={onEditSelection}>Изменить состав</button>}

        <ol className="plan" aria-label="Упражнения по порядку">
          {workout.entries.map((entry, index) => {
            const up = canMove(index, index - 1);
            const down = canMove(index, index + 1);
            const isExcluded = excluded.has(entry.exercise.name);
            return (
              <li
                key={entry.slotKey}
                className={`plan__row${dragIndex === index ? ' plan__row--dragging' : ''}`}
                draggable={up || down}
                onDragStart={(e) => {
                  if (!(up || down)) return;
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (dragIndex === null || dragIndex === index) return;
                  if (workout.entries[dragIndex]?.groupUsed !== entry.groupUsed) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  move(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
              >
                <div className="plan__main">
                  <span className="plan__handle" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </span>
                  <span className="plan__index">{index + 1}</span>
                  <span className="plan__body">
                    <button className="plan__exercise plan__exercise-button" onClick={() => setDetail(entry.exercise)} aria-label={`Подробнее: ${entry.exercise.name}`}><span>{entry.exercise.name}</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 5.5v1" /></svg></button>
                    <span className="plan__group">
                      {entry.groupUsed}
                      {isExcluded ? ' · не предлагать' : ''}
                    </span>
                    {entry.exercise.equipment.length > 0 && (
                      <span className="plan__equip">{entry.exercise.equipment.join(', ')}</span>
                    )}
                  </span>
                  {entry.isRepeat && <span className="plan__badge">повтор</span>}
                </div>
                <div className="plan__controls">
                  <button className="btn btn--ghost btn--sm" onClick={() => setReplacing(index)}>
                    Заменить
                  </button>
                  <details className="plan__more">
                    <summary aria-label={`Другие действия: ${entry.exercise.name}`}>Ещё</summary>
                    <div className="plan__menu">
                      {(up || down) && <span className="plan__move">
                        <button
                          className="plan__move-btn"
                          aria-label={`Переместить выше: ${entry.exercise.name}`}
                          disabled={!up}
                          onClick={() => move(index, index - 1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          className="plan__move-btn"
                          aria-label={`Переместить ниже: ${entry.exercise.name}`}
                          disabled={!down}
                          onClick={() => move(index, index + 1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </span>}
                      <button
                        className="btn btn--ghost btn--sm"
                        aria-pressed={isExcluded}
                        disabled={saving !== undefined}
                        onClick={() => void toggleExclude(entry.exercise.name)}
                      >
                        {isExcluded ? 'Вернуть в подбор' : 'Исключить из будущих подборов'}
                      </button>
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ol>

        {workout.entries.some((entry, index) => canMove(index, index + 1)) && <aside className="note">
          В меню «Ещё» можно менять порядок внутри одной группы. Между группами порядок фиксирован.
        </aside>}

        <div className="screen__cta screen__cta--sticky">
          <button className="btn btn--primary" onClick={onStart} disabled={starting}>
            {starting ? 'Открываем…' : 'Начать тренировку'}
          </button>
          {regenerable && <details className="preview-options">
            <summary>Изменить тренировку</summary>
            {onEditParameters && <button className="btn btn--ghost" onClick={onEditParameters}>Формат и объём подбора</button>}
            <button className="btn btn--ghost" onClick={onRegenerate}>Подобрать заново</button>
          </details>}
        </div>
      </div>

      {replacing !== null && current !== undefined && (
        <div className="overlay" onClick={closeSheet}>
          <section
            className="dialog dialog--sheet"
            ref={replacementDialog}
            role="dialog"
            aria-modal="true"
            aria-label={`Замена упражнения «${current.exercise.name}»`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog__handle" aria-hidden="true" />
            <header className="dialog__head">
              <div>
                <h2 className="dialog__title">Заменить упражнение</h2>
                <p className="dialog__sub">{current.exercise.name}</p>
              </div>
              <button className="dialog__close" onClick={closeSheet} aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="replace__search field">
              {actionError && <p className="body-error" role="alert">{actionError}</p>}
              <label className="field__label" htmlFor="replace-query">
                Поиск
              </label>
              <input
                id="replace-query"
                className="field__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Название или группа"
                autoComplete="off"
              />
            </div>

            <ul className="replace__list" aria-label="Кандидаты на замену">
              {filtered.length === 0 && (
                <li className="replace__empty">Подходящих упражнений не нашлось.</li>
              )}
              {filtered.map((candidate) => (
                <li key={candidate.name} className="replace__row">
                  <button
                    className="replace__pick"
                    onClick={() => {
                      onReplace(replacing, candidate);
                      closeSheet();
                    }}
                  >
                    <span className="replace__name">{candidate.name}</span>
                    <span className="replace__meta">
                      {candidate.primary}
                      {candidate.equipment.length > 0 ? ` · ${candidate.equipment.join(', ')}` : ''}
                    </span>
                  </button>
                  {!excluded.has(candidate.name) && (
                    <details className="plan__more"><summary aria-label={`Другие действия: ${candidate.name}`}>Ещё</summary><button
                      className="replace__exclude"
                      disabled={saving !== undefined}
                      onClick={() => void toggleExclude(candidate.name)}
                    >
                      Исключить из будущих подборов
                    </button></details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {detail && <ExerciseDetail exercise={detail} pickLabel="" excluded={false} onClose={() => setDetail(null)} />}
      </fieldset>
    </div>
  );
}
