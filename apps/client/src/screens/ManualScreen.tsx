import { queryExcludedNames } from '../data/local/read-rpc';
import { useEffect, useMemo, useRef, useState } from 'react';
import { typeLabel } from '../lib/workoutTypes';
import { slotCandidates } from '@gymix/generator';
import type { CatalogExercise } from '@gymix/catalog/parse';
import { structureFor, type Draft } from '../lib/draft';
import { getCatalog } from '../lib/catalog';
import { useDb } from '../hooks/useDb';
import { excludeExerciseByName, includeExerciseByName } from '../lib/exclusions';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { exerciseArt } from '../lib/exerciseArt';
import { IconDumbbellArt } from '../lib/icons';

interface ManualScreenProps {
  draft: Draft;
  startSlotKey?: string;
  onSlotChange: (slotKey: string) => void;
  onSelect: (slotKey: string, name: string) => void;
  onBack: () => void;
  onDone: () => void;
  onToStructure: () => void;
}

export function ManualScreen({ draft, startSlotKey, onSlotChange, onSelect, onBack, onDone, onToStructure }: ManualScreenProps) {
  const { db, revision } = useDb();
  const slots = useMemo(() => structureFor(draft).slots, [draft]);
  const [index, setIndex] = useState(() => {
    if (startSlotKey === undefined) return 0;
    const found = slots.findIndex((s) => s.slotKey === startSlotKey);
    return found < 0 ? 0 : found;
  });
  const [query, setQuery] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<CatalogExercise | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [lastPicked, setLastPicked] = useState('');
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

  const slot = slots[index];
  const filled = Object.values(draft.selections ?? {}).filter((n) => n.length > 0).length;
  const total = slots.length;
  const selectedName = slot === undefined ? undefined : draft.selections?.[slot.slotKey];
  useEffect(() => {
    setQuery('');
    root.current?.closest('main')?.scrollTo(0, 0);
    if (slot) onSlotChange(slot.slotKey);
    // Only a different position changes the search and scroll context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.slotKey]);

  const candidates = useMemo(() => {
    if (db === undefined || slot === undefined) return [];
    return slotCandidates(slot, getCatalog(), excluded);
  }, [db, slot, excluded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return candidates;
    return candidates.filter((c) => `${c.name} ${c.equipment.join(' ')}`.toLowerCase().includes(q));
  }, [candidates, query]);

  const isLast = index === total - 1;

  const choose = (name: string) => {
    if (slot === undefined) return;
    onSelect(slot.slotKey, name);
    setLastPicked(name);
    if (!isLast) setIndex(index + 1);
  };

  const clearChoice = () => {
    if (slot === undefined) return;
    onSelect(slot.slotKey, '');
  };

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

  if (slot === undefined) return null;

  const alternatives = slot.alternativeGroupIds.filter(group => !slot.allowedGroupIds.includes(group));
  const slotAlt = alternatives.length > 0 ? ` или ${alternatives.join(' или ')}` : '';

  return (
    <div className="screen" ref={root}>
      <header className="topbar">
        <button className="topbar__back" onClick={() => index > 0 ? setIndex(index - 1) : onBack()} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Выбор упражнений</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{typeLabel(draft.type)}</span>
          <span className="volume-head__meta">
            Выбрано {filled} из {total}
          </span>
        </div>
        {lastPicked && <p className="body-muted manual-feedback" role="status">Добавлено: {lastPicked}</p>}

        {actionError && <p className="body-error" role="alert">{actionError}</p>}
        {undoExclude && <p className="note" role="status">«{undoExclude}»: {excluded.has(undoExclude) ? 'исключено из будущих подборов' : 'снова доступно для подбора'}. <button className="text-action" disabled={saving !== undefined} onClick={() => void toggleExclude(undoExclude, false)}>Отменить</button></p>}
        <div className="manual-group">
          <span className="manual-group__label">
            {slot.allowedGroupIds[0]}
            {slotAlt}
          </span>
          <span className="manual-group__count">
            {index + 1} / {total}
          </span>
        </div>

        <div className="field manual-filter">
          <label className="field__label" htmlFor="manual-query">
            Поиск
          </label>
          <input
            id="manual-query"
            className="field__input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название упражнения"
            autoComplete="off"
          />
        </div>

        <ul className="manual-grid" aria-label="Подходящие упражнения">
          {filtered.length === 0 && (
            <li className="manual-empty">
              {excluded.size > 0 && candidates.length === 0
                ? 'Все упражнения группы отмечены «Не предлагать». Загляни в Настройки, чтобы вернуть их.'
                : query ? `По запросу «${query}» ничего не найдено.` : 'Подходящих упражнений не нашлось.'}
              {query && <button className="text-action" onClick={() => setQuery('')}>Сбросить поиск</button>}
            </li>
          )}
          {filtered.map((candidate) => {
            const isActive = candidate.name === selectedName;
            const art = exerciseArt(candidate.name);
            return (
              <li key={candidate.name} className={`manual-card ${isActive ? 'manual-card--active' : ''}`}>
                <button
                  className="manual-card__open"
                  onClick={() => setDetail(candidate)}
                  aria-label={`Подробнее: ${candidate.name}`}
                >
                  <span
                    className={`manual-card__thumb${
                      art !== undefined ? (art.kind === 'photo' ? ' manual-card__thumb--photo' : ' manual-card__thumb--art') : ''
                    }`}
                    aria-hidden="true"
                  >
                    {art !== undefined ? (
                      <img className="manual-card__thumb-img" src={art.src} alt="" loading="lazy" />
                    ) : (
                      <IconDumbbellArt className="manual-card__thumb-art" />
                    )}
                  </span>
                  <span className="manual-card__info">
                    <span className="manual-card__name">{candidate.name}</span>
                    <span className="manual-card__meta">
                      {candidate.secondaryMuscles.slice(0, 2).map((m) => (
                        <span className="manual-card__chip" key={m}>
                          {m}
                        </span>
                      ))}
                      {candidate.equipment.map((e) => (
                        <span className="manual-card__chip" key={e}>
                          {e}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
                <div className="manual-card__row">
                  <details className="plan__more manual-card__more"><summary>Ещё</summary>
                  <button
                    className="btn btn--ghost btn--sm manual-card__exclude"
                    disabled={saving !== undefined}
                    onClick={() => void toggleExclude(candidate.name)}
                  >
                    Исключить из будущих подборов
                  </button></details>
                  <button
                    className="btn btn--sm manual-card__pick"
                    aria-pressed={isActive}
                    onClick={() => choose(candidate.name)}
                  >
                    {isActive ? 'Выбрано' : 'Выбрать'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {selectedName !== undefined && selectedName !== '' && (
          <div className="manual-current">
            <span className="manual-current__slot">Выбрано:</span>
            <span className="manual-current__name">{selectedName}</span>
            <button className="btn btn--ghost btn--sm" onClick={clearChoice}>
              Снять
            </button>
          </div>
        )}

        <div className="screen__cta screen__cta--sticky">
          {filled === total ? (
              <button className="btn btn--primary" onClick={onDone}>
                Готово — посмотреть состав
              </button>
            ) : isLast ? (
              <button className="btn btn--primary" onClick={onToStructure}>
                Заполнить оставшиеся
              </button>
            ) : (
            <button className="btn btn--primary" onClick={() => setIndex(index + 1)}>
              {selectedName ? 'Далее' : 'Пропустить пока'}
            </button>
          )}
          <button className="btn btn--ghost" onClick={onToStructure}>Обзор состава</button>
        </div>
      </div>

      {detail !== null && (
        <ExerciseDetail
          exercise={detail}
          error={actionError}
          pickLabel={detail.name === selectedName ? 'Выбрано' : 'Выбрать'}
          picked={detail.name === selectedName}
          excluded={excluded.has(detail.name)}
          saving={saving !== undefined}
          onPick={() => {
            choose(detail.name);
            setDetail(null);
          }}
          onToggleExclude={() => void toggleExclude(detail.name)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
