import { useMemo, useState } from 'react';
import { findStructure, type WorkoutType } from '@gymix/structures';
import { Button } from '../components/Button';
import { WorkoutTypeCard } from '../components/WorkoutTypeCard';
import { StructureSlotList } from '../components/StructureSlotList';
import { useDb } from '../hooks/useDb';
import { workoutTypeCards } from '../lib/workoutTypes';

interface TypeScreenProps {
  onSelect: (type: WorkoutType) => void;
  onClose: () => void;
}

export function TypeScreen({ onSelect, onClose }: TypeScreenProps) {
  const { counts, error } = useDb();
  const cards = useMemo(() => workoutTypeCards(), []);
  const [selected, setSelected] = useState<WorkoutType>('Full Body');

  const structure = findStructure({ type: selected, volume: 'Стандартная' });

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onClose} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Тип тренировки</h1>
      </header>

      <div className="screen__body">
        {error !== undefined && (
          <p className="body-error" role="alert">
            Не удалось открыть базу: {String(error)}
          </p>
        )}

        {counts !== undefined && (
          <p className="context-hint">
            {cards.length} форматов · {counts.exercises} упражнений в каталоге
          </p>
        )}

        <div className="type-grid">
          {cards.map((card) => (
            <WorkoutTypeCard
              key={card.type}
              card={card}
              selected={card.type === selected}
              onSelect={() => setSelected(card.type)}
            />
          ))}
        </div>

        <section className="preview" aria-label="Структура тренировки">
          <div className="preview__head">
            <span className="preview__title">{selected}</span>
            <span className="preview__meta">
              Стандартная · {structure.exerciseCount} упражнений
            </span>
          </div>
          <StructureSlotList structure={structure} />
        </section>

        <div className="screen__cta">
          <Button variant="primary" onClick={() => onSelect(selected)}>
            Продолжить
          </Button>
        </div>
      </div>
    </div>
  );
}