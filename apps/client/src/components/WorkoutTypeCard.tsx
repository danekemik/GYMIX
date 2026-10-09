import type { WorkoutTypeCard } from '../lib/workoutTypes';
import { isMgs } from '../lib/workoutTypes';

interface WorkoutTypeCardProps {
  card: WorkoutTypeCard;
  selected: boolean;
  onSelect: () => void;
}

export function WorkoutTypeCard({ card, selected, onSelect }: WorkoutTypeCardProps) {
  const [compact, standard, extended] = card.counts;
  return (
    <button
      className={`type-card ${selected ? 'type-card--on' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="type-card__top">
        <span className="type-card__name">{card.type}</span>
        {selected && (
          <span className="type-card__check" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>
      <span className="type-card__groups">
        {isMgs(card.type) ? 'одна группа' : card.groups.join(' · ')}
      </span>
      <span className="type-card__counts">
        <span className="type-card__count">К {compact}</span>
        <span className="type-card__count">С {standard}</span>
        <span className="type-card__count">Р {extended}</span>
      </span>
    </button>
  );
}