import { typeLabel } from '../lib/workoutTypes';
import { VOLUME_LEVELS, type VolumeLevel } from '@gymix/structures';
import { Button } from '../components/Button';
import { exerciseCount, plural, type Draft } from '../lib/draft';
import { isMgs } from '../lib/workoutTypes';

interface VolumeScreenProps {
  draft: Draft;
  onVolumeChange: (volume: VolumeLevel) => void;
  onContinue: () => void;
  onManual: () => void;
  onBack: () => void;
  hasComposition?: boolean;
  hasSelection?: boolean;
}

export function VolumeScreen({ draft, onVolumeChange, onContinue, onManual, onBack, hasComposition, hasSelection }: VolumeScreenProps) {
  const volume = draft.volume;

  const select = (value: VolumeLevel) => {
    onVolumeChange(value);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Объём</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{typeLabel(draft.type)}</span>
          {isMgs(draft.type) && draft.mgsGroup && (
            <span className="volume-head__group">{draft.mgsGroup}</span>
          )}
        </div>

        <div className="volume-grid">
          {VOLUME_LEVELS.map((value) => {
            const count = exerciseCount({ ...draft, volume: value });
            const selected = volume === value;
            return (
              <button
                key={value}
                className={`volume-card ${selected ? 'volume-card--on' : ''}`}
                aria-pressed={selected}
                onClick={() => select(value)}
              >
                <span className="volume-card__top">
                  <span className="volume-card__name">{value}</span>
                  {selected && (
                    <span className="volume-card__check" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </span>
                <span className="volume-card__bottom">
                  <span className="volume-card__count">
                    {plural(count, ['упражнение', 'упражнения', 'упражнений'])}
                  </span>
                  <span className="volume-card__sets">{plural(count * 3, ['подход', 'подхода', 'подходов'])}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="screen__cta">
          <Button variant="primary" onClick={onContinue}>
            {hasComposition ? 'К составу тренировки' : hasSelection ? 'Дополнить подбором' : 'Подобрать упражнения'}
          </Button>
          <button className="btn btn--ghost" onClick={onManual}>Выбрать упражнения вручную</button>
        </div>
      </div>
    </div>
  );
}
