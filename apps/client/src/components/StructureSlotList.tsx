import type { Structure } from '@gymix/structures';
import { hasAlternatives, renderGroupLabel } from '../lib/slotLabel';

interface StructureSlotListProps {
  structure: Structure;
}

export function StructureSlotList({ structure }: StructureSlotListProps) {
  const undecided = structure.slots.every((slot) => slot.allowedGroupIds.length === 0);

  if (undecided) {
    return (
      <p className="slots__hint">
        Целевая группа выбирается на шаге структуры — слоты заполнятся под неё.
      </p>
    );
  }

  return (
    <ol className="slots">
      {structure.slots.map((slot, index) => {
        const alt = hasAlternatives(slot);
        return (
          <li key={slot.slotKey} className="slots__row">
            <span className="slots__group">
              {renderGroupLabel(slot, index)}
              {alt && (
                <em className="slots__alt">или {slot.alternativeGroupIds.join(', ')}</em>
              )}
            </span>
            <span className="slots__count">1 ×</span>
          </li>
        );
      })}
    </ol>
  );
}