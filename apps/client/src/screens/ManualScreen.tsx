import { queryExcludedNames } from '../data/local/read-rpc';
import { useId, useEffect, useMemo, useRef, useState } from 'react';
import { typeLabel } from '../lib/workoutTypes';
import { slotCandidates } from '@gymix/generator';
import type { CatalogExercise } from '@gymix/catalog/parse';
import { plural, structureFor, type Draft } from '../lib/draft';
import { getCatalog } from '../lib/catalog';
import { useDb } from '../hooks/useDb';
import { excludeExerciseByName, includeExerciseByName } from '../lib/exclusions';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { exerciseArt } from '../lib/exerciseArt';
import { IconCheck, IconChevronRight, IconDumbbellArt, IconPlus } from '../lib/icons';

interface ManualScreenProps {
  draft: Draft;
  startSlotKey?: string;
  /** Название редактируемого шаблона. */
  templateTitle?: string;
  onSlotChange: (slotKey: string) => void;
  onSelect: (slotKey: string, name: string) => void;
  onBack: () => void;
  onDone: () => void;
  onGenerate: () => void;
}

export function ManualScreen({ draft, startSlotKey, templateTitle, onSlotChange, onSelect, onBack, onDone, onGenerate }: ManualScreenProps) {
  const { db, revision } = useDb();
  const slots = useMemo(() => structureFor(draft).slots, [draft]);
  const progressLabelId = useId();
  const [view, setView] = useState<'groups' | 'picker'>(startSlotKey !== undefined ? 'picker' : 'groups');
  const [pickerSlotKey, setPickerSlotKey] = useState<string | undefined>(startSlotKey);
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

  useEffect(() => {
    if (lastPicked === '') return;
    const timer = window.setTimeout(() => setLastPicked(''), 4000);
    return () => window.clearTimeout(timer);
  }, [lastPicked]);

  useEffect(() => {
    if (undoExclude === undefined) return;
    const timer = window.setTimeout(() => setUndoExclude(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [undoExclude]);

  const slot = useMemo(() => slots.find((s) => s.slotKey === pickerSlotKey), [slots, pickerSlotKey]);
  const filled = Object.values(draft.selections ?? {}).filter((n) => n.length > 0).length;
  const total = slots.length;
  const selectedName = slot === undefined ? undefined : draft.selections?.[slot.slotKey];

  useEffect(() => {
    if (view !== 'picker') return;
    setQuery('');
    root.current?.closest('main')?.scrollTo(0, 0);
    if (slot) onSlotChange(slot.slotKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.slotKey, view]);

  const candidates = useMemo(() => {
    if (db === undefined || slot === undefined) return [];
    return slotCandidates(slot, getCatalog(), excluded);
  }, [db, slot, excluded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return candidates;
    return candidates.filter((c) => `${c.name} ${c.equipment.join(' ')}`.toLowerCase().includes(q));
  }, [candidates, query]);

  const choose = (name: string) => {
    if (slot === undefined) return;
    onSelect(slot.slotKey, name);
    setLastPicked(name);
    setView('groups');
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

  const openPicker = (slotKey: string) => {
    setPickerSlotKey(slotKey);
    setView('picker');
  };

  if (view === 'groups') {
    return (
      <div className="screen" ref={root}>
        <header className="topbar">
          <button className="topbar__back" onClick={onBack} aria-label={templateTitle ? 'Назад к шаблонам' : 'Назад'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="topbar__title topbar__title--step">{templateTitle ?? 'Выбор упражнений'}</h1>
        </header>

        <div className="screen__body">
          <div className="volume-head volume-head--stack">
            <span className="context__type">{typeLabel(draft.type)}</span>
            <span className="volume-head__meta volume-head__meta--stack">
              {templateTitle !== undefined && <span className="volume-head__template">Шаблон</span>}
              <span>{draft.volume}</span>
              <span>{plural(total, ['упражнение', 'упражнения', 'упражнений'])}</span>
            </span>
          </div>

          <div className="progress">
            <span className="progress__label" id={progressLabelId}>Выбрано {filled} из {total} упражнений</span>
            <span
              className="progress__track"
              role="progressbar"
              aria-labelledby={progressLabelId}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={filled}
            >
              <span className="progress__bar" style={{ width: `${total > 0 ? (filled / total) * 100 : 0}%` }} />
            </span>
          </div>

          {lastPicked && <p className="body-muted manual-feedback" role="status">Добавлено: {lastPicked}</p>}
          {actionError && <p className="body-error" role="alert">{actionError}</p>}
          {undoExclude && <p className="note" role="status">«{undoExclude}»: {excluded.has(undoExclude) ? 'исключено из подбора' : 'снова доступно для подбора'}. <button className="text-action" disabled={saving !== undefined} onClick={() => void toggleExclude(undoExclude, false)}>Отменить</button></p>}

          <ul className="manual-grid" aria-label="Слоты">
            {slots.map((s) => {
              const name = draft.selections?.[s.slotKey];
              const filledSlot = Boolean(name && name.length > 0);
              const alternatives = s.alternativeGroupIds.filter((g) => !s.allowedGroupIds.includes(g));
              const alt = alternatives.length > 0 ? ` или ${alternatives.join(' или ')}` : '';
              const groupName = `${s.allowedGroupIds[0]}${alt}`;
              if (filledSlot) {
                const art = exerciseArt(name!);
                return (
                  <li key={s.slotKey} className="manual-card manual-card--active">
                    <button className="manual-card__open" onClick={() => openPicker(s.slotKey)} aria-label={`Изменить: ${name}`}>
                      <span
                        className={`manual-card__thumb${art !== undefined ? (art.kind === 'photo' ? ' manual-card__thumb--photo' : ' manual-card__thumb--art') : ''}`}
                        aria-hidden="true"
                      >
                        {art !== undefined ? (
                          <img className="manual-card__thumb-img" src={art.src} alt="" loading="lazy" />
                        ) : (
                          <IconDumbbellArt className="manual-card__thumb-art" />
                        )}
                      </span>
                      <span className="manual-card__info">
                        <span className="manual-card__name">{name}</span>
                        <span className="manual-card__meta">
                          <span className="manual-card__chip">{groupName}</span>
                        </span>
                      </span>
                      <span className="manual-card__action" aria-hidden="true">
                        Изменить
                        <IconChevronRight className="manual-card__action-icon" />
                      </span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={s.slotKey} className="manual-card manual-card--empty">
                  <button className="manual-card__open" onClick={() => openPicker(s.slotKey)} aria-label={`Выбрать упражнение: ${groupName}`}>
                    <span className="manual-card__info">
                      <span className="manual-card__name">{groupName}</span>
                      <span className="manual-group__count">не выбрано</span>
                    </span>
                    <span className="manual-card__action manual-card__action--primary" aria-hidden="true">
                      Выбрать
                      <IconChevronRight className="manual-card__action-icon" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="screen__cta screen__cta--sticky">
            {filled === total ? (
              <button className="btn btn--primary" onClick={onDone}>Посмотреть тренировку</button>
            ) : (
              <button className="btn btn--primary" onClick={onGenerate}>Заполнить оставшиеся</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (slot === undefined) return null;

  const alternatives = slot.alternativeGroupIds.filter((group) => !slot.allowedGroupIds.includes(group));
  const slotAlt = alternatives.length > 0 ? ` или ${alternatives.join(' или ')}` : '';

  return (
    <div className="screen" ref={root}>
      <header className="topbar">
        <button className="topbar__back" onClick={() => setView('groups')} aria-label="Назад к составу">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Выбрать упражнение</h1>
      </header>

      <div className="screen__body">
        <div className="manual-group">
          <span className="manual-group__label">
            {slot.allowedGroupIds[0]}
            {slotAlt}
          </span>
          <span className="manual-group__count">
            {slots.findIndex((s) => s.slotKey === slot.slotKey) + 1} / {total}
          </span>
        </div>

        {lastPicked && <p className="body-muted manual-feedback" role="status">Добавлено: {lastPicked}</p>}
        {actionError && <p className="body-error" role="alert">{actionError}</p>}
        {undoExclude && <p className="note" role="status">«{undoExclude}»: {excluded.has(undoExclude) ? 'исключено из подбора' : 'снова доступно для подбора'}. <button className="text-action" disabled={saving !== undefined} onClick={() => void toggleExclude(undoExclude, false)}>Отменить</button></p>}

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

        <ul className="manual-grid manual-grid--picker" aria-label="Подходящие упражнения">
          {filtered.length === 0 && (
            <li className="manual-empty">
              {excluded.size > 0 && candidates.length === 0
                ? 'Все упражнения группы исключены из подбора. Загляни в Настройки, чтобы вернуть их.'
                : query ? `По запросу «${query}» ничего не найдено.` : 'Подходящих упражнений не нашлось.'}
              {query && <button className="text-action" onClick={() => setQuery('')}>Сбросить поиск</button>}
            </li>
          )}
          {filtered.map((candidate) => {
            const isActive = candidate.name === selectedName;
            const art = exerciseArt(candidate.name);
            return (
              <li key={candidate.name} className={`manual-card manual-card--option${isActive ? ' manual-card--active' : ''}`}>
                <button
                  className="manual-card__open"
                  onClick={() => setDetail(candidate)}
                  aria-label={`Подробнее: ${candidate.name}`}
                  aria-haspopup="dialog"
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
                    <span className="manual-card__hint">i</span>
                  </span>
                  <span className="manual-card__info">
                    <span className="manual-card__name">{candidate.name}</span>
                    {candidate.equipment.length > 0 && (
                      <span className="manual-card__equip">{candidate.equipment.join(' · ')}</span>
                    )}
                  </span>
                </button>
                <button
                  className="btn manual-card__pick"
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`Выбрать: ${candidate.name}`}
                  onClick={() => (isActive ? clearChoice() : choose(candidate.name))}
                >
                  {isActive ? (
                    <IconCheck className="manual-card__pick-icon" />
                  ) : (
                    <IconPlus className="manual-card__pick-icon" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="manual-current">
          <span className="manual-current__slot">Выбрано:</span>
          <span className="manual-current__name">{selectedName && selectedName.length > 0 ? selectedName : '—'}</span>
          {selectedName && selectedName.length > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={clearChoice}>Снять</button>
          )}
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
