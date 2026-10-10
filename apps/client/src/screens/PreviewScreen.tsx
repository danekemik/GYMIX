import type { GeneratedWorkout } from '@gymix/generator';
import { plural } from '../lib/draft';

interface PreviewScreenProps {
  workout: GeneratedWorkout;
  onStart: () => void;
  onRegenerate: () => void;
  onBack: () => void;
  /** Шаблон не перегенерируется — упражнения зафиксированы. */
  regenerable?: boolean;
}

export function PreviewScreen({ workout, onStart, onRegenerate, onBack, regenerable = true }: PreviewScreenProps) {
  const total = workout.entries.length;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Предпросмотр</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{workout.type}</span>
          <span className="volume-head__meta">
            {workout.volume} · {plural(total, ['упражнение', 'упражнения', 'упражнений'])}
          </span>
        </div>

        <ol className="plan">
          {workout.entries.map((entry, index) => (
            <li key={entry.slotKey} className="plan__row">
              <span className="plan__index">{index + 1}</span>
              <span className="plan__body">
                <span className="plan__exercise">{entry.exercise.name}</span>
                <span className="plan__group">{entry.groupUsed}</span>
              </span>
              {entry.isRepeat && <span className="plan__badge">повтор</span>}
            </li>
          ))}
        </ol>

        <aside className="note">
          Порядок упражнений можно будет менять на старте. Структура и число
          слотов фиксированы.
        </aside>

        <div className="screen__cta">
          <button className="btn btn--primary" onClick={onStart}>
            Начать тренировку
          </button>
          {regenerable && (
            <button className="btn btn--ghost cta-row__second" onClick={onRegenerate}>
              Перегенерировать
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
