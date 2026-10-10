import { useEffect, useMemo, useState } from 'react';
import { slotCandidates } from '@gymix/generator';
import type { CatalogExercise } from '@gymix/catalog/parse';
import { plural, structureFor, type Draft } from '../lib/draft';
import { getCatalog } from '../lib/catalog';
import { useDb } from '../hooks/useDb';
import { excludedExerciseNames, excludeExerciseByName, includeExerciseByName } from '../lib/exclusions';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { IconDumbbellArt } from '../lib/icons';

interface ManualScreenProps {
  draft: Draft;
  onSelect: (slotKey: string, name: string) => void;
  onBack: () => void;
  onDone: () => void;
  onToStructure: () => void;
}

export function ManualScreen({ draft, onSelect, onBack, onDone, onToStructure }: ManualScreenProps) {
  const { db } = useDb();
  const slots = useMemo(() => structureFor(draft).slots, [draft]);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<CatalogExercise | null>(null);

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

  const slot = slots[index];
  const filled = Object.values(draft.selections ?? {}).filter((n) => n.length > 0).length;
  const total = slots.length;
  const selectedName = slot === undefined ? undefined : draft.selections?.[slot.slotKey];

  const candidates = useMemo(() => {
    if (db === undefined || slot === undefined) return [];
    return slotCandidates(slot, getCatalog(), excluded);
  }, [db, slot, excluded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, query]);

  const isLast = index === total - 1;

  const choose = (name: string) => {
    if (slot === undefined) return;
    onSelect(slot.slotKey, name);
    if (!isLast) setIndex(index + 1);
  };

  const clearChoice = () => {
    if (slot === undefined) return;
    onSelect(slot.slotKey, '');
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

  if (slot === undefined) return null;

  const slotAlt = slot.alternativeGroupIds.length > 0 ? ` или ${slot.alternativeGroupIds.join(' или ')}` : '';

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Выбор упражнений</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{draft.type}</span>
          <span className="volume-head__meta">
            Заполнено {filled} из {plural(total, ['слота', 'слотов', 'слотов'])}
          </span>
        </div>

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

        <ul className="manual-grid" role="listbox" aria-label="Подходящие упражнения">
          {filtered.length === 0 && (
            <li className="manual-empty">
              {excluded.size > 0 && candidates.length === 0
                ? 'Все упражнения группы отмечены «Не предлагать». Загляни в Настройки, чтобы вернуть их.'
                : 'Подходящих упражнений не нашлось.'}
            </li>
          )}
          {filtered.map((candidate) => {
            const isActive = candidate.name === selectedName;
            return (
              <li key={candidate.name} className={`manual-card ${isActive ? 'manual-card--active' : ''}`}>
                <button
                  className="manual-card__open"
                  onClick={() => setDetail(candidate)}
                  aria-label={`Подробнее: ${candidate.name}`}
                >
                  <span className="manual-card__thumb" aria-hidden="true">
                    <IconDumbbellArt className="manual-card__thumb-art" />
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
                <span className="manual-card__row">
                  <button
                    className="btn btn--ghost btn--sm manual-card__exclude"
                    disabled={saving !== undefined}
                    onClick={() => void toggleExclude(candidate.name)}
                  >
                    Не предлагать это упражнение
                  </button>
                  <button
                    className="btn btn--sm manual-card__pick"
                    aria-pressed={isActive}
                    onClick={() => choose(candidate.name)}
                  >
                    {isActive ? 'Выбрано' : 'Выбрать'}
                  </button>
                </span>
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

        <div className="screen__cta">
          {isLast ? (
            filled === total ? (
              <button className="btn btn--primary" onClick={onDone}>
                К предпросмотру
              </button>
            ) : (
              <button className="btn btn--primary" onClick={onToStructure}>
                В структуру
              </button>
            )
          ) : (
            <button className="btn btn--primary" onClick={() => setIndex(index + 1)}>
              Далее
            </button>
          )}
        </div>
      </div>

      {detail !== null && (
        <ExerciseDetail
          exercise={detail}
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