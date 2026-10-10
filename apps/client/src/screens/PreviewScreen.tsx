import { useEffect, useMemo, useState } from 'react';
import {
  replacementCandidates,
  slotFor,
  type GeneratedWorkout,
} from '@gymix/generator';
import type { CatalogExercise } from '@gymix/catalog/parse';
import { plural, type Draft } from '../lib/draft';
import { getCatalog } from '../lib/catalog';
import { useDb } from '../hooks/useDb';
import { excludedExerciseNames, excludeExerciseByName, includeExerciseByName } from '../lib/exclusions';

interface PreviewScreenProps {
  workout: GeneratedWorkout;
  draft: Draft;
  onStart: () => void;
  onRegenerate: () => void;
  onBack: () => void;
  /** Упражнение заменено в предпросмотре (S09). */
  onReplace: (index: number, exercise: CatalogExercise) => void;
  /** Шаблон не перегенерируется — упражнения зафиксированы. */
  regenerable?: boolean;
}

export function PreviewScreen({
  workout,
  draft,
  onStart,
  onRegenerate,
  onBack,
  onReplace,
  regenerable = true,
}: PreviewScreenProps) {
  const { db } = useDb();
  const [replacing, setReplacing] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    void excludedExerciseNames(db)
      .then((names) => alive && setExcluded(new Set(names)))
      .catch(() => alive && setExcluded(new Set()));
    return () => {
      alive = false;
    };
  }, [db]);

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

  const toggleExclude = async (name: string) => {
    if (db === undefined || saving !== undefined) return;
    setSaving(name);
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
    } finally {
      setSaving(undefined);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Предпросмотр</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{workout.type}</span>
          <span className="volume-head__meta">
            {workout.volume} · {plural(total, ['упражнение', 'упражнения', 'упражнений'])}
          </span>
        </div>

        <ol className="plan">
          {workout.entries.map((entry, index) => (
            <li key={entry.slotKey} className="plan__row">
              <span className="plan__index">{index + 1}</span>
              <span className="plan__body">
                <span className="plan__exercise">{entry.exercise.name}</span>
                <span className="plan__group">
                  {entry.groupUsed}
                  {excluded.has(entry.exercise.name) ? ' · не предлагать' : ''}
                </span>
              </span>
              {entry.isRepeat && <span className="plan__badge">повтор</span>}
            </li>
          ))}
        </ol>

        <div className="plan__actions">
          {workout.entries.map((entry, index) => (
            <div className="plan__action" key={entry.slotKey}>
              <span className="plan__action-name">{entry.exercise.name}</span>
              <span className="plan__action-buttons">
                <button className="btn btn--ghost btn--sm" onClick={() => setReplacing(index)}>
                  Заменить
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  aria-pressed={excluded.has(entry.exercise.name)}
                  disabled={saving !== undefined}
                  onClick={() => void toggleExclude(entry.exercise.name)}
                >
                  {excluded.has(entry.exercise.name) ? 'Предлагать снова' : 'Не предлагать'}
                </button>
              </span>
            </div>
          ))}
        </div>

        <aside className="note">
          Порядок упражнений можно будет менять на старте. Структура и число
          слотов фиксированы.
        </aside>

        <div className="screen__cta">
          <button className="btn btn--primary" onClick={onStart}>
            Начать тренировку
          </button>
          {regenerable && (
            <button className="btn btn--ghost cta-row__second" onClick={onRegenerate}>
              Перегенерировать
            </button>
          )}
        </div>
      </div>

      {replacing !== null && current !== undefined && (
        <div className="overlay" onClick={closeSheet}>
          <section
            className="dialog dialog--sheet"
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

            <ul className="replace__list" role="listbox" aria-label="Кандидаты на замену">
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
                    <button
                      className="replace__exclude"
                      disabled={saving !== undefined}
                      onClick={() => void toggleExclude(candidate.name)}
                    >
                      Не предлагать
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}