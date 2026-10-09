import { useMemo } from 'react';
import type { WorkoutType } from '@gymix/structures';
import { useDb } from '../hooks/useDb';
import { workoutTypeCards } from '../lib/workoutTypes';

interface WorkoutsScreenProps {
  onStart: (type: WorkoutType) => void;
  onCreate: () => void;
  onOpenProfile: () => void;
}

const QUICK_START: readonly WorkoutType[] = ['Full Body', 'Upper Body', 'Lower Body'];

const TYPE_LABEL: Record<WorkoutType, string> = {
  'Full Body': 'Full Body',
  'Upper Body': 'Верх тела',
  'Lower Body': 'Низ тела',
  Push: 'Жимы',
  Pull: 'Тяги',
  Legs: 'Ноги',
  'Muscle Group Split': 'Одна группа',
};

const QUICK_SUBTITLE: Record<WorkoutType, string> = {
  'Full Body': 'Все группы мышц',
  'Upper Body': 'Грудь, спина, руки',
  'Lower Body': 'Ноги, ягодицы',
  Push: 'Грудь, плечи, трицепс',
  Pull: 'Спина, бицепс, предплечья',
  Legs: 'Ноги, ягодицы',
  'Muscle Group Split': 'Тонкая проработка',
};

/* Первая сохранённая тренировка: пример из реальной структуры
 * Upper Body / Стандартная (число упражнений и группы — из MATRIX). */
const SAVED_EXAMPLE = {
  type: 'Upper Body' as const,
  volume: 'Стандартная',
  exerciseCount: 7,
  tags: ['Грудь', 'Спина', 'Плечи', 'Руки'] as const,
};

/* Пример из активности: Full Body, вчера. */
const ACTIVITY_EXAMPLE = {
  type: 'Full Body',
  when: 'Вчера',
  exerciseCount: 8,
  duration: '52 мин',
};

export function WorkoutsScreen({ onStart, onCreate, onOpenProfile }: WorkoutsScreenProps) {
  const { error } = useDb();
  const cards = useMemo(() => workoutTypeCards(), []);

  const quick = QUICK_START.map((type) => cards.find((c) => c.type === type)).filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title">Тренировки</h1>
        <button className="topbar__icon-btn" aria-label="Открыть настройки" onClick={onOpenProfile}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z"
            />
          </svg>
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
            <p className="hero__text">Создай занятие из упражнений под свои цели и уровень</p>
            <button className="hero__cta" onClick={onCreate}>
              Создать тренировку
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="hero__art" aria-hidden>
            <svg viewBox="0 0 96 96" fill="currentColor">
              <rect x="20" y="44.5" width="56" height="7" rx="3.5" />
              <rect x="12" y="32" width="10" height="32" rx="4" />
              <rect x="74" y="32" width="10" height="32" rx="4" />
              <rect x="24" y="38" width="8" height="20" rx="3" />
              <rect x="64" y="38" width="8" height="20" rx="3" />
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
                <QuickIcon type={card.type} />
                <span className="quick-card__name">{TYPE_LABEL[card.type]}</span>
                <span className="quick-card__subtitle">{QUICK_SUBTITLE[card.type]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mine" aria-label="Мои тренировки">
          <SectionHead title="Мои тренировки" more="Все тренировки" />
          <div className="mine-list">
            <article className="wk-card">
              <div className="wk-card__body">
                <p className="wk-card__title">
                  {TYPE_LABEL[SAVED_EXAMPLE.type]} <span className="wk-card__dot">•</span>{' '}
                  {SAVED_EXAMPLE.volume}
                </p>
                <p className="wk-card__meta">
                  {SAVED_EXAMPLE.exerciseCount} упражнений
                </p>
                <ul className="wk-card__tags">
                  {SAVED_EXAMPLE.tags.map((tag) => (
                    <li key={tag} className="wk-card__tag">
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="wk-card__menu" aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </span>
            </article>
          </div>
        </section>

        <section className="recent" aria-label="Недавняя активность">
          <SectionHead title="Недавняя активность" more="Вся активность" />
          <div className="recent-list">
            <article className="act-card">
              <div className="act-card__body">
                <p className="act-card__title">{ACTIVITY_EXAMPLE.type}</p>
                <p className="act-card__meta">
                  {ACTIVITY_EXAMPLE.when} • {ACTIVITY_EXAMPLE.exerciseCount} упражнений
                </p>
              </div>
              <p className="act-card__duration">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {ACTIVITY_EXAMPLE.duration}
              </p>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHead({ title, more }: { title: string; more: string }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      <span className="section-more">
        {more}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

function QuickIcon({ type }: { type: WorkoutType }) {
  if (type === 'Full Body') {
    return (
      <svg className="quick-card__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="3.7" r="2.2" />
        <path d="M9.6 6.6 6 8.3a1.5 1.5 0 0 0-.8 1.5l.3 3.2a1.1 1.1 0 0 0 2.2-.1l-.1-2.3 1.9 1.1-.1 2-1 5.2a1.15 1.15 0 0 0 2.25.5l1.35-4.9h.5l1.35 4.9a1.15 1.15 0 0 0 2.25-.5l-1-5.2-.1-2 1.9-1.1-.1 2.3a1.1 1.1 0 0 0 2.2.1l.3-3.2a1.5 1.5 0 0 0-.8-1.5L14.4 6.6a2.9 2.9 0 0 1-4.8 0z" />
      </svg>
    );
  }
  if (type === 'Upper Body') {
    return (
      <svg className="quick-card__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8.8 3.4 4.7 5.6A1.6 1.6 0 0 0 4 7.7l.9 2.5a1.3 1.3 0 0 0 1.7.8l1-.4v6.9a1.4 1.4 0 0 0 1.4 1.4h6a1.4 1.4 0 0 0 1.4-1.4v-6.9l1 .4a1.3 1.3 0 0 0 1.7-.8l.9-2.5a1.6 1.6 0 0 0-.7-2.1L15.2 3.4a3.2 3.2 0 0 1-6.4 0z" />
      </svg>
    );
  }
  return (
    <svg className="quick-card__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 3.4h10a1.3 1.3 0 0 1 1.3 1.5l-.9 13.2a1.5 1.5 0 0 1-1.5 1.4h-1.8a1.5 1.5 0 0 1-1.5-1.4L12 12.9l-.6 5.2a1.5 1.5 0 0 1-1.5 1.4H8.1a1.5 1.5 0 0 1-1.5-1.4L5.7 4.9A1.3 1.3 0 0 1 7 3.4z" />
    </svg>
  );
}