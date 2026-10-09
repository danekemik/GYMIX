import { useState } from 'react';
import {
  MGS_CATEGORIES,
  MGS_CATEGORY_GROUPS,
  type GeneratorMuscleGroup,
  type MgsCategory,
} from '@gymix/structures';
interface MgsGroupScreenProps {
  onGroupSelect: (group: GeneratorMuscleGroup) => void;
  onBack: () => void;
}

const CATEGORY_LABEL: Record<MgsCategory, string> = {
  Chest: 'Грудь',
  Back: 'Спина',
  Shoulders: 'Плечи',
  Legs: 'Ноги',
  Arms: 'Руки',
};

export function MgsGroupScreen({ onGroupSelect, onBack }: MgsGroupScreenProps) {
  const [category, setCategory] = useState<MgsCategory>('Chest');

  const groups = MGS_CATEGORY_GROUPS[category];

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
          Muscle Group Split — отдельная группа на всю тренировку. Сначала выберите
          категорию, затем группу.
        </p>

        <div className="mgs-cats" role="tablist" aria-label="Категория">
          {MGS_CATEGORIES.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={value === category}
              className={`mgs-cat ${value === category ? 'mgs-cat--on' : ''}`}
              onClick={() => setCategory(value)}
            >
              {CATEGORY_LABEL[value]}
            </button>
          ))}
        </div>

        <div className="mgs-groups">
          {groups.map((group) => (
            <button
              key={group}
              className="mgs-group"
              onClick={() => onGroupSelect(group)}
            >
              <span className="mgs-group__name">{group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}