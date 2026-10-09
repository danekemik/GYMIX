import { useMemo } from 'react';
import type { WorkoutType } from '@gymix/structures';
import { useDb } from '../hooks/useDb';
import { workoutTypeCards } from '../lib/workoutTypes';

interface WorkoutsScreenProps {
  onStart: (type: WorkoutType) => void;
  onCreate: () => void;
}

const QUICK_START: readonly WorkoutType[] = ['Full Body', 'Upper Body', 'Lower Body'];

const TYPE_LABEL: Record<WorkoutType, string> = {
  'Full Body': 'Полное тело',
  'Upper Body': 'Верх тела',
  'Lower Body': 'Низ тела',
  Push: 'Жимы',
  Pull: 'Тяги',
  Legs: 'Ноги',
  'Muscle Group Split': 'Одна группа',
};

export function WorkoutsScreen({ onStart, onCreate }: WorkoutsScreenProps) {
  const { counts, error } = useDb();
  const cards = useMemo(() => workoutTypeCards(), []);

  const quick = QUICK_START.map((type) => cards.find((c) => c.type === type)).filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title">Тренировки</h1>
        <button className="topbar__avatar" aria-label="Открыть профиль">
          П
        </button>
      </header>

      <div className="screen__body">
        <div className="greeting">
          <h2 className="greeting__title">Хорошей тренировки</h2>
          <p className="greeting__text">Собери занятие под себя</p>
        </div>

        {error !== undefined && (
          <p className="body-error" role="alert">
            Не удалось открыть базу: {String(error)}
          </p>
        )}

        <section className="hero" aria-label="Новая тренировка">
          <div className="hero__copy">
            <h3 className="hero__title">Новая тренировка</h3>
            <button className="hero__cta" onClick={onCreate}>
              Создать тренировку
            </button>
          </div>
          <div className="hero__art" aria-hidden>
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="5">
              <path d="M28 30v16M20 38h16M28 50v16" strokeLinecap="round" />
              <path d="M68 30v16M60 38h16M68 50v16" strokeLinecap="round" />
              <path d="M36 38h24M36 50h24" strokeLinecap="round" />
            </svg>
          </div>
        </section>

        <section className="quick" aria-label="Быстрый старт">
          <h2 className="section-title">Быстрый старт</h2>
          <div className="quick-grid">
            {quick.map((card) => (
              <button
                key={card.type}
                className="quick-card"
                onClick={() => onStart(card.type)}
              >
                <span className="quick-card__name">{TYPE_LABEL[card.type]}</span>
                <span className="quick-card__count">
                  {card.counts[1]} упражнений
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mine" aria-label="Мои тренировки">
          <h2 className="section-title">Мои тренировки</h2>
          {counts !== undefined && <MyWorkouts empty={true} onCreate={onCreate} />}
        </section>
      </div>
    </div>
  );
}

function MyWorkouts({ empty, onCreate }: { empty: boolean; onCreate: () => void }) {
  if (empty) {
    return (
      <div className="mine-empty">
        <p className="mine-empty__text">
          Сохранённых тренировок пока нет. Соберите свою или начните с шаблона.
        </p>
        <button className="mine-empty__cta" onClick={onCreate}>
          Создать первую
        </button>
      </div>
    );
  }
  return null;
}