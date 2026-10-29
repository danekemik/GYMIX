import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  MGS_CATEGORIES,
  MGS_CATEGORY_GROUPS,
  type GeneratorMuscleGroup,
  type MgsCategory,
} from '@gymix/structures';
import { MGS_CATEGORY_LABELS } from '../lib/workoutTypes';

interface MgsGroupScreenProps {
  selectedGroup?: GeneratorMuscleGroup | undefined;
  onGroupSelect: (group: GeneratorMuscleGroup) => void;
  onBack: () => void;
}

export function MgsGroupScreen({ selectedGroup, onGroupSelect, onBack }: MgsGroupScreenProps) {
  const initialCategory = useMemo(
    () => MGS_CATEGORIES.find(value => selectedGroup && (MGS_CATEGORY_GROUPS[value] as readonly GeneratorMuscleGroup[]).includes(selectedGroup)) ?? 'Chest',
    [selectedGroup],
  );
  const [category, setCategory] = useState<MgsCategory>(initialCategory);
  const [pending, setPending] = useState<GeneratorMuscleGroup | undefined>(selectedGroup);

  const groups = MGS_CATEGORY_GROUPS[category];

  // В категориях «Грудь», «Спина», «Плечи» выбор один — незачем просить его подтвердить.
  useEffect(() => {
    const options = MGS_CATEGORY_GROUPS[category];
    if (options.length === 1) setPending(options[0]);
  }, [category]);

  const chooseCategory = (value: MgsCategory) => {
    setCategory(value);
    const options = MGS_CATEGORY_GROUPS[value];
    if (options.length === 1) setPending(options[0]);
    else if (pending !== undefined && !(options as readonly GeneratorMuscleGroup[]).includes(pending)) setPending(undefined);
  };

  const onCategoryKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const last = MGS_CATEGORIES.length - 1;
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowRight'
          ? (index + 1) % MGS_CATEGORIES.length
          : (index - 1 + MGS_CATEGORIES.length) % MGS_CATEGORIES.length;
    const value = MGS_CATEGORIES[next];
    if (value === undefined) return;
    chooseCategory(value);
    document.getElementById(`mgs-cat-${value}`)?.focus();
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Целевая группа</h1>
      </header>

      <div className="screen__body">
        <p className="context-hint">
          Выбери группу на всю тренировку. Для ног и рук можно уточнить нужные мышцы.
        </p>

        <div className="mgs-cats" role="tablist" aria-label="Категория мышц">
          {MGS_CATEGORIES.map((value, index) => (
            <button
              key={value}
              id={`mgs-cat-${value}`}
              role="tab"
              aria-selected={value === category}
              aria-controls="mgs-groups"
              tabIndex={value === category ? 0 : -1}
              className={`mgs-cat ${value === category ? 'mgs-cat--on' : ''}`}
              onKeyDown={(event) => onCategoryKey(event, index)}
              onClick={() => chooseCategory(value)}
            >
              {MGS_CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>

        <p className="mgs-groups__label">Мышца</p>

        <div className="mgs-groups" id="mgs-groups" role="tabpanel" aria-label={MGS_CATEGORY_LABELS[category]}>
          {groups.map((group) => (
            <button
              key={group}
              className="mgs-group"
              aria-pressed={pending === group}
              onClick={() => setPending(group)}
            >
              <span className="mgs-group__name">{group}</span>
              {pending === group && (
                <svg className="mgs-group__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="screen__cta">
        <button
          className="btn btn--primary"
          disabled={pending === undefined}
          onClick={() => { if (pending !== undefined) onGroupSelect(pending); }}
        >
          Продолжить
        </button>
      </div>
    </div>
  );
}
