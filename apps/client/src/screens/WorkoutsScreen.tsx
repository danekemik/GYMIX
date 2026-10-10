import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { WorkoutType } from '@gymix/structures';
import { Segmented } from '../components/Segmented';
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
  IconTorso,
} from '../lib/icons';
import {
  activeDraft,
  deleteDraft,
  latestSession,
  resumeDraft,
  type DraftSummary,
  type HistoryItem,
  type ResumedSession,
} from '../lib/session';
import {
  copyTemplate,
  deleteTemplate,
  renameTemplate,
  templatesFor,
  type TemplateCard,
} from '../lib/templates';
import { workoutTypeCards } from '../lib/workoutTypes';

interface WorkoutsScreenProps {
  onStart: (type: WorkoutType) => void;
  onCreate: () => void;
  onOpenProfile: () => void;
  onOpenActivity: () => void;
  onOpenTemplate: (templateId: string) => void;
  onEditTemplate: (templateId: string) => void;
  onResume: (session: ResumedSession) => void;
}

type Segment = 'ready' | 'mine';

const SEGMENT_KEY = 'gymix:home-segment';
const SEGMENT_OPTIONS = [
  { value: 'ready', label: 'Шаблоны' },
  { value: 'mine', label: 'Мои тренировки' },
] as const;

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

type MenuTarget = TemplateCard | null;

export function WorkoutsScreen({
  onStart,
  onCreate,
  onOpenProfile,
  onOpenActivity,
  onOpenTemplate,
  onEditTemplate,
  onResume,
}: WorkoutsScreenProps) {
  const { db, error } = useDb();
  const cards = useMemo(() => workoutTypeCards(), []);
  const [segment, setSegment] = useState<Segment>(() =>
    localStorage.getItem(SEGMENT_KEY) === 'mine' ? 'mine' : 'ready',
  );
  const [recent, setRecent] = useState<HistoryItem | null | 'loading'>('loading');
  const [templates, setTemplates] = useState<TemplateCard[] | 'loading'>('loading');
  const [draft, setDraft] = useState<DraftSummary | null | 'loading'>('loading');

  const [menuFor, setMenuFor] = useState<MenuTarget>(null);
  const [renameFor, setRenameFor] = useState<MenuTarget>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removeFor, setRemoveFor] = useState<MenuTarget>(null);
  const [removeDraft, setRemoveDraft] = useState(false);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    activeDraft(db)
      .then((row) => alive && setDraft(row))
      .catch(() => alive && setDraft(null));
    return () => {
      alive = false;
    };
  }, [db]);

  const reloadTemplates = useCallback(async () => {
    if (db === undefined) return;
    try {
      setTemplates(await templatesFor(db));
    } catch {
      setTemplates([]);
    }
  }, [db]);

  useEffect(() => {
    void reloadTemplates();
  }, [reloadTemplates]);

  const changeSegment = (value: Segment) => {
    localStorage.setItem(SEGMENT_KEY, value);
    setSegment(value);
  };

  const continueDraft = async () => {
    if (db === undefined || draft === null || draft === 'loading') return;
    setBusy(true);
    try {
      const resumed = await resumeDraft(db, draft.sessionId);
      onResume(resumed);
    } catch {
      setBusy(false);
    }
  };

  const confirmDeleteDraft = async () => {
    if (db === undefined || draft === null || draft === 'loading') return;
    setBusy(true);
    try {
      await deleteDraft(db, draft.sessionId);
      setDraft(null);
    } finally {
      setBusy(false);
      setRemoveDraft(false);
    }
  };

  const openMenu = (template: TemplateCard) => {
    setMenuFor(template);
  };

  const doRename = async () => {
    const title = renameValue.trim();
    if (title === '' || db === undefined || renameFor === null) return;
    setBusy(true);
    try {
      await renameTemplate(db, renameFor.id, title);
      setRenameFor(null);
      await reloadTemplates();
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async () => {
    if (db === undefined || menuFor === null) return;
    setBusy(true);
    try {
      await copyTemplate(db, menuFor.id);
      setMenuFor(null);
      await reloadTemplates();
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (db === undefined || removeFor === null) return;
    setBusy(true);
    try {
      await deleteTemplate(db, removeFor.id);
      setRemoveFor(null);
      await reloadTemplates();
    } finally {
      setBusy(false);
    }
  };

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

        {draft !== null && draft !== 'loading' && (
          <section className="resume" aria-label="Незавершённая тренировка">
            <div className="resume__head">
              <span className="resume__plate" aria-hidden>
                <IconClock />
              </span>
              <div className="resume__body">
                <p className="resume__title">
                  {draft.type} <span className="wk-card__dot">·</span> {draft.volume}
                </p>
                <p className="resume__meta">
                  Начата {formatDay(draft.startedAt)} · {draft.doneSets}/{draft.totalSets} подходов
                </p>
              </div>
            </div>
            <div className="resume__actions">
              <button className="btn btn--primary btn--sm" onClick={() => void continueDraft()} disabled={busy}>
                Продолжить
              </button>
              <button
                className="btn btn--ghost btn--sm resume__danger"
                onClick={() => setRemoveDraft(true)}
                disabled={busy}
              >
                Удалить черновик
              </button>
            </div>
          </section>
        )}

        <div className="home-segment">
          <Segmented
            options={SEGMENT_OPTIONS}
            value={segment}
            onChange={changeSegment}
            label="Раздел тренировок"
          />
        </div>

        {segment === 'ready' ? (
          <>
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
          </>
        ) : (
          <section className="mine" aria-label="Мои тренировки">
            <SectionHead title="Мои тренировки" />
            {templates === 'loading' ? (
              <p className="body-muted">Загружаем шаблоны…</p>
            ) : templates.length === 0 ? (
              <div className="empty-train">
                <p className="empty-train__title">Пока пусто</p>
                <p className="empty-train__text">
                  Сохрани завершённую тренировку как шаблон, чтобы повторить её
                  в один тап.
                </p>
                <button className="btn btn--primary" onClick={onCreate}>
                  Создать тренировку
                </button>
              </div>
            ) : (
              <div className="mine-list">
                {templates.map((template) => (
                  <article key={template.id} className="wk-card">
                    <button
                      className="wk-card__main"
                      onClick={() => onOpenTemplate(template.id)}
                      aria-label={`Открыть шаблон «${template.title}»`}
                    >
                      <span className="wk-card__plate" aria-hidden>
                        <IconTorso />
                      </span>
                      <span className="wk-card__body">
                        <span className="wk-card__title">{template.title}</span>
                        <span className="wk-card__meta">
                          {template.type} <span className="wk-card__dot">·</span>{' '}
                          {template.volume}
                        </span>
                        <span className="wk-card__tags">
                          <span className="wk-card__tag">{template.exerciseCount} упражнений</span>
                          <span className="wk-card__date">{formatDay(template.createdAt)}</span>
                        </span>
                      </span>
                    </button>
                    <button
                      className="wk-card__menu"
                      aria-label="Меню шаблона"
                      onClick={() => openMenu(template)}
                    >
                      <IconDots />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {menuFor !== null && (
        <div className="overlay">
          <div className="dialog menu-dialog" role="dialog" aria-modal="true" aria-labelledby="menu-title">
            <h2 id="menu-title" className="dialog__title">
              {menuFor.title}
            </h2>
            <div className="menu-list" role="menu">
              <button
                className="menu-action"
                role="menuitem"
                onClick={() => {
                  onOpenTemplate(menuFor.id);
                  setMenuFor(null);
                }}
              >
                Открыть
              </button>
              <button
                className="menu-action"
                role="menuitem"
                onClick={() => {
                  onEditTemplate(menuFor.id);
                  setMenuFor(null);
                }}
              >
                Изменить
              </button>
              <button className="menu-action" role="menuitem" onClick={() => void doCopy()} disabled={busy}>
                Копировать
              </button>
              <button
                className="menu-action"
                role="menuitem"
                onClick={() => {
                  setRenameValue(menuFor.title);
                  setRenameFor(menuFor);
                  setMenuFor(null);
                }}
              >
                Переименовать
              </button>
              <button
                className="menu-action menu-action--danger"
                role="menuitem"
                onClick={() => {
                  setRemoveFor(menuFor);
                  setMenuFor(null);
                }}
              >
                Удалить
              </button>
            </div>
            <button className="btn btn--ghost" onClick={() => setMenuFor(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {renameFor !== null && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title">
            <h2 id="rename-title" className="dialog__title">
              Переименовать шаблон
            </h2>
            <label className="field">
              <span className="field__label">Название</span>
              <input
                className="field__input"
                type="text"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void doRename();
                }}
                autoFocus
                maxLength={60}
              />
            </label>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => void doRename()} disabled={busy}>
                Сохранить
              </button>
              <button className="btn btn--ghost" onClick={() => setRenameFor(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {removeFor !== null && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="remove-title">
            <h2 id="remove-title" className="dialog__title">
              Удалить шаблон?
            </h2>
            <p className="dialog__text">
              «{removeFor.title}» исчезнет без возможности восстановления. История
              тренировок не изменится.
            </p>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => void doDelete()} disabled={busy}>
                Удалить
              </button>
              <button className="btn btn--ghost" onClick={() => setRemoveFor(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {removeDraft && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="remove-draft-title">
            <h2 id="remove-draft-title" className="dialog__title">
              Удалить черновик?
            </h2>
            <p className="dialog__text">
              Прогресс текущей тренировки будет стёрт. Это действие нельзя
              отменить.
            </p>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => void confirmDeleteDraft()} disabled={busy}>
                Удалить
              </button>
              <button className="btn btn--ghost" onClick={() => setRemoveDraft(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
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