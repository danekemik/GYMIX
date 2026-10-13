import type { ReactElement } from 'react';
import { IconFigure, IconLegs, IconTorso } from './icons';

/** Пиктограмма типа тренировки для списков и экрана выбора. */
export function typeIcon(type: string): ReactElement {
  if (type === 'Full Body') return <span className="type-icon type-icon--full-body" />;
  if (type === 'Upper Body') return <span className="type-icon type-icon--upper-body" />;
  if (type === 'Lower Body') return <span className="type-icon type-icon--lower-body" />;
  if (type === 'Push') return <span className="type-icon type-icon--push" />;
  if (type === 'Pull') return <span className="type-icon type-icon--pull" />;
  if (type === 'Muscle Group Split') return <IconTorso />;
  if (type === 'Legs') return <IconLegs />;
  return <IconFigure />;
}
