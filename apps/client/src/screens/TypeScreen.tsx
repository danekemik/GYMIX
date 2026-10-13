import { useMemo, useState } from 'react';
import type { WorkoutType } from '@gymix/structures';
import { Button } from '../components/Button';
import { WorkoutTypeRow } from '../components/WorkoutTypeRow';
import { useDb } from '../hooks/useDb';
import { workoutTypeCards } from '../lib/workoutTypes';

interface TypeScreenProps {
  onSelect: (type: WorkoutType) => void;
  onClose: () => void;
}

export function TypeScreen({ onSelect, onClose }: TypeScreenProps) {
  const { error } = useDb();
  const cards = useMemo(() => workoutTypeCards(), []);
  const [selected, setSelected] = useState<WorkoutType>('Full Body');

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onClose} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Формат</h1>
      </header>

      <div className="screen__body">
        {error !== undefined && (
          <p className="body-error" role="alert">
            Не удалось открыть базу: {String(error)}
          </p>
        )}

        <div className="type-list" role="radiogroup" aria-label="Формат">
          {cards.map((card) => (
            <WorkoutTypeRow
              key={card.type}
              card={card}
              selected={card.type === selected}
              onSelect={() => setSelected(card.type)}
            />
          ))}
        </div>

        <div className="screen__cta">
          <Button variant="primary" className="vt-formats-cta" onClick={() => onSelect(selected)}>
            Продолжить
          </Button>
        </div>
      </div>
    </div>
  );
}
