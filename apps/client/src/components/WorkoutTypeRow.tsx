import { useId } from 'react';
import { typeIcon } from '../lib/typeIcon';
import { isMgs, type WorkoutTypeCard } from '../lib/workoutTypes';

interface WorkoutTypeRowProps {
  card: WorkoutTypeCard;
  selected: boolean;
  onSelect: () => void;
}

export function WorkoutTypeRow({ card, selected, onSelect }: WorkoutTypeRowProps) {
  const metaId = useId();

  return (
    <label className={`type-row ${selected ? 'type-row--on' : ''}`}>
      <input
        type="radio"
        name="workout-type"
        className="type-row__input"
        aria-label={card.type}
        aria-describedby={metaId}
        checked={selected}
        onChange={onSelect}
      />
      <span className="type-row__plate" aria-hidden>
        {typeIcon(card.type)}
      </span>
      <span className="type-row__body">
        <span className="type-row__name">{card.type}</span>
        <span className="type-row__meta" id={metaId}>
          {isMgs(card.type) ? 'Одна группа на выбор' : card.groups.join(' · ')}
        </span>
      </span>
      <span className="type-row__radio" aria-hidden />
    </label>
  );
}
