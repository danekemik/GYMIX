import type { CatalogExercise } from '@gymix/catalog/parse';
import { IconDumbbellArt } from '../lib/icons';

interface ExerciseDetailProps {
  exercise: CatalogExercise;
  /** Подпись основной кнопки выбора. */
  pickLabel: string;
  picked?: boolean;
  excluded: boolean;
  saving?: boolean;
  onPick?: () => void;
  onToggleExclude: () => void;
  onClose: () => void;
}

/** Карточка упражнения (S16): изображение-плейсхолдер, мышцы, оборудование и действия. */
export function ExerciseDetail({
  exercise,
  pickLabel,
  picked = false,
  excluded,
  saving = false,
  onPick,
  onToggleExclude,
  onClose,
}: ExerciseDetailProps) {
  return (
    <div className="overlay" onClick={onClose}>
      <section
        className="dialog dialog--sheet exercise-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`Упражнение «${exercise.name}»`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__handle" aria-hidden="true" />
        <div className="exercise-detail__photo" aria-hidden="true">
          <IconDumbbellArt className="exercise-detail__art" />
        </div>
        <header className="dialog__head">
          <div>
            <h2 className="dialog__title">{exercise.name}</h2>
            <p className="dialog__sub">{exercise.primary}</p>
          </div>
          <button className="dialog__close" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <dl className="exercise-detail__facts">
          <div className="exercise-detail__fact">
            <dt>Основная</dt>
            <dd>{exercise.primary}</dd>
          </div>
          <div className="exercise-detail__fact">
            <dt>Вторичные</dt>
            <dd>{exercise.secondaryMuscles.length > 0 ? exercise.secondaryMuscles.join(', ') : '—'}</dd>
          </div>
          <div className="exercise-detail__fact">
            <dt>Оборудование</dt>
            <dd>{exercise.equipment.length > 0 ? exercise.equipment.join(', ') : 'Без оборудования'}</dd>
          </div>
        </dl>

        <div className="dialog__actions">
          {onPick !== undefined && (
            <button className="btn btn--primary" aria-pressed={picked} onClick={onPick}>
              {pickLabel}
            </button>
          )}
          <button
            className="btn btn--ghost"
            aria-pressed={excluded}
            disabled={saving}
            onClick={onToggleExclude}
          >
            {excluded ? 'Предлагать снова' : 'Не предлагать'}
          </button>
        </div>
      </section>
    </div>
  );
}
