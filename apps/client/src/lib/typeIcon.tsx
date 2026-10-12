import type { ReactElement } from 'react';
import { IconFigure, IconLegs, IconTorso } from './icons';

/** Пиктограмма типа тренировки для списков и экрана выбора. */
export function typeIcon(type: string): ReactElement {
  if (type === 'Upper Body' || type === 'Push' || type === 'Muscle Group Split') {
    return <IconTorso />;
  }
  if (type === 'Legs' || type === 'Lower Body') return <IconLegs />;
  return <IconFigure />;
}
