import { typeLabel } from '../lib/workoutTypes';
import { useId } from 'react';
import { typeIcon } from '../lib/typeIcon';
import { previewGroups, type WorkoutTypeCard } from '../lib/workoutTypes';

interface WorkoutTypeRowProps {
  card: WorkoutTypeCard;
  selected: boolean;
  onSelect: () => void;
}

export function WorkoutTypeRow({ card, selected, onSelect }: WorkoutTypeRowProps) {
  const metaId = useId();
  const groups = previewGroups(card);

  return (
    <label className={`type-row ${selected ? 'type-row--on' : ''}`}>
      <input
        type="radio"
        name="workout-type"
        className="type-row__input"
        aria-label={card.type}
        aria-describedby={groups.length > 0 ? metaId : undefined}
        checked={selected}
        onChange={onSelect}
      />
      <span className="type-row__plate" aria-hidden>
        {typeIcon(card.type)}
      </span>
      <span className="type-row__body">
        <span className="type-row__name">{card.type}</span>
        <span className="type-row__description">{typeLabel(card.type)}</span>
        {groups.length > 0 && (
          <span className="type-row__groups" id={metaId}>
            {groups.map((group) => (
              <span className="type-row__group" key={group}>
                {group}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="type-row__radio" aria-hidden />
    </label>
  );
}
