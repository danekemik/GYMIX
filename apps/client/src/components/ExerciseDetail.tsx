import type { CatalogExercise } from '@gymix/catalog/parse';
import { exerciseArt } from '../lib/exerciseArt';
import { IconDumbbellArt } from '../lib/icons';
import { useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface ExerciseDetailProps {
  exercise: CatalogExercise;
  /** Подпись основной кнопки выбора. */
  pickLabel: string;
  picked?: boolean;
  excluded: boolean;
  saving?: boolean;
  onPick?: () => void;
  onToggleExclude?: () => void;
  error?: string | undefined;
  onClose: () => void;
}

/** Информация из каталога и действия над упражнением. */
export function ExerciseDetail({
  exercise,
  pickLabel,
  picked = false,
  excluded,
  saving = false,
  onPick,
  onToggleExclude,
  onClose,
  error,
}: ExerciseDetailProps) {
  const art = exerciseArt(exercise.name);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, true, onClose);
  return (
    <div className="overlay exercise-overlay" onClick={onClose}>
      <section
        className="dialog dialog--sheet exercise-detail"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Упражнение «${exercise.name}»`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__handle" aria-hidden="true" />
        <header className="dialog__head">
          <div>
            <h2 className="dialog__title">{exercise.name}</h2>
          </div>
          <button className="dialog__close" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="exercise-detail__body">
          <dl className="exercise-detail__facts">
            <div className="exercise-detail__fact">
              <dt>Основные мышцы</dt>
              <dd>{exercise.muscles.join(', ')}</dd>
            </div>
            {exercise.secondaryMuscles.length > 0 && <div className="exercise-detail__fact">
              <dt>Также работают</dt>
              <dd>{exercise.secondaryMuscles.join(', ')}</dd>
            </div>}
            <div className="exercise-detail__fact">
              <dt>Оборудование</dt>
              <dd>{exercise.equipment.length > 0 ? exercise.equipment.join(', ') : 'Без оборудования'}</dd>
            </div>
          </dl>
          <div
            className={`exercise-detail__photo${
              art !== undefined ? (art.kind === 'photo' ? ' exercise-detail__photo--photo' : ' exercise-detail__photo--art') : ''
            }`}
            aria-hidden="true"
          >
            {art !== undefined ? (
              <img className="exercise-detail__photo-img" src={art.src} alt="" />
            ) : (
              <IconDumbbellArt className="exercise-detail__art" />
            )}
          </div>

          {error && <p className="body-error" role="alert">{error}</p>}
        </div>
        <div className="dialog__actions">
          {onPick !== undefined && (
            <button className="btn btn--primary" aria-pressed={picked} onClick={onPick}>
              {pickLabel}
            </button>
          )}
          {onToggleExclude && <button
            className="btn btn--ghost"
            aria-pressed={excluded}
            disabled={saving}
            onClick={onToggleExclude}
          >
            {excluded ? 'Вернуть в подбор' : 'Исключить из будущих подборов'}
          </button>}
        </div>
      </section>
    </div>
  );
}
