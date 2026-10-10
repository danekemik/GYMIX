import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { WorkoutType } from '@gymix/structures';
import { useDb } from '../hooks/useDb';
import { formatDay, formatDurationMs } from '../lib/format';
import {
  IconArrowRight,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconDots,
  IconDumbbellArt,
  IconFigure,
  IconGear,
  IconLegs,
  IconList,
  IconTorso,
} from '../lib/icons';
import { latestSession, type HistoryItem } from '../lib/session';
import { workoutTypeCards } from '../lib/workoutTypes';

interface WorkoutsScreenProps {
  onStart: (type: WorkoutType) => void;
  onCreate: () => void;
  onOpenProfile: () => void;
  onOpenActivity: () => void;
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

const QUICK_ICON: Record<WorkoutType, (p: { className: string }) => ReactElement> = {
  'Full Body': IconFigure,
  'Upper Body': IconTorso,
  'Lower Body': IconLegs,
  Push: IconTorso,
  Pull: IconFigure,
  Legs: IconLegs,
  'Muscle Group Split': IconFigure,
};

/* Первая сохранённая тренировка: пример из реальной структуры
 * Upper Body / Стандартная (число упражнений и группы — из MATRIX). */
const SAVED_EXAMPLE = {
  type: 'Upper Body' as const,
  volume: 'Стандартная',
  exerciseCount: 7,
  tags: ['Грудь', 'Спина', 'Плечи', 'Руки'] as const,
};

export function WorkoutsScreen({
  onStart,
  onCreate,
  onOpenProfile,
  onOpenActivity,
}: WorkoutsScreenProps) {
  const { db, error } = useDb();
  const cards = useMemo(() => workoutTypeCards(), []);
  const [recent, setRecent] = useState<HistoryItem | null | 'loading'>('loading');

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    latestSession(db)
      .then((row) => alive && setRecent(row ?? null))
      .catch(() => alive && setRecent(null));
    return () => {
      alive = false;
    };
  }, [db]);

  const quick = QUICK_START.map((type) => cards.find((c) => c.type === type)).filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title">Тренировки</h1>
        <button className="topbar__icon-btn" aria-label="Открыть настройки" onClick={onOpenProfile}>
          <IconGear />
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
            <p className="hero__text">
              <span>Собери своё занятие</span>
              <span>на свои цели и уровень</span>
            </p>
          </div>
          <div className="hero__art" aria-hidden>
            <IconDumbbellArt />
          </div>
          <button className="hero__cta" onClick={onCreate}>
            <span className="hero__cta-label">Создать тренировку</span>
            <IconArrowRight className="hero__cta-arrow" />
          </button>
        </section>

        <section className="quick" aria-label="Быстрый старт">
          <SectionHead title="Быстрый старт" chevronOnly />
          <div className="quick-grid">
            {quick.map((card) => {
              const Icon = QUICK_ICON[card.type];
              return (
                <button key={card.type} className="quick-card" onClick={() => onStart(card.type)}>
                  <Icon className="quick-card__icon" />
                  <span className="quick-card__head">
                    <span className="quick-card__name">{TYPE_LABEL[card.type]}</span>
                    <IconChevronRight className="quick-card__chevron" />
                  </span>
                  <span className="quick-card__subtitle">{QUICK_SUBTITLE[card.type]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mine" aria-label="Мои тренировки">
          <SectionHead title="Мои тренировки" more="Все тренировки" />
          <div className="mine-list">
            <article className="wk-card">
              <span className="wk-card__plate" aria-hidden>
                <IconList />
              </span>
              <div className="wk-card__body">
                <p className="wk-card__title">
                  {TYPE_LABEL[SAVED_EXAMPLE.type]} <span className="wk-card__dot">·</span>{' '}
                  {SAVED_EXAMPLE.volume}
                </p>
                <p className="wk-card__meta">{SAVED_EXAMPLE.exerciseCount} упражнений</p>
                <ul className="wk-card__tags">
                  {SAVED_EXAMPLE.tags.map((tag) => (
                    <li key={tag} className="wk-card__tag">
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="wk-card__menu" aria-hidden>
                <IconDots />
              </span>
            </article>
          </div>
        </section>

        <section className="recent" aria-label="Недавняя активность">
          <SectionHead title="Недавняя активность" more="Вся активность" onMore={onOpenActivity} />
          <div className="recent-list">
            {recent === null ? (
              <div className="act-card act-card--empty">
                Здесь появится последняя тренировка
              </div>
            ) : recent === 'loading' ? null : (
              <article className="act-card">
                <span className="act-card__plate" aria-hidden>
                  <IconCalendar />
                </span>
                <div className="act-card__body">
                  <p className="act-card__title">{recent.type}</p>
                  <p className="act-card__meta">
                    {formatDay(recent.completedAt)} · {recent.done}/{recent.total} упражнений
                  </p>
                </div>
                <p className="act-card__duration">
                  <IconClock />
                  {formatDurationMs(recent.durationMs)}
                </p>
                <IconChevronRight className="act-card__chevron" />
              </article>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHead({
  title,
  more,
  chevronOnly,
  onMore,
}: {
  title: string;
  more?: string;
  chevronOnly?: boolean;
  onMore?: () => void;
}) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {onMore !== undefined ? (
        <button className="section-more" onClick={onMore}>
          {more}
          <IconChevronRight />
        </button>
      ) : chevronOnly ? (
        <span className="section-more section-more--chev" aria-hidden>
          <IconChevronRight />
        </span>
      ) : (
        <span className="section-more">
          {more}
          <IconChevronRight />
        </span>
      )}
    </div>
  );
}