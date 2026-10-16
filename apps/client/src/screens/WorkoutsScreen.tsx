import { takeOwnership } from '../data/sync/engine';
import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
import fitnessIcon from '../assets/fitness.png';
import { getUserName } from '../lib/account';
import { plural } from '../lib/draft';
import { formatDay, formatDurationMs } from '../lib/format';
import { IconArrowRight, IconChevronRight, IconClock } from '../lib/icons';
import { typeIcon } from '../lib/typeIcon';
import {
  activeDraft,
  deleteDraft,
  recentSessions,
  resumeDraft,
  type DraftSummary,
  type HistoryItem,
  type ResumedSession,
} from '../lib/session';
import { typeLabel } from '../lib/workoutTypes';

interface WorkoutsScreenProps {
  onCreate: () => void;
  onOpenActivity: () => void;
  onOpenSession: (sessionId: string) => void;
  onResume: (session: ResumedSession) => void;
}

export function WorkoutsScreen({
  onCreate,
  onOpenActivity,
  onOpenSession,
  onResume,
}: WorkoutsScreenProps) {
  const { db, error, revision } = useDb();
  const name = getUserName();
  const [recent, setRecent] = useState<HistoryItem[] | 'loading'>('loading');
  const [draft, setDraft] = useState<DraftSummary | null | 'loading'>('loading');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeDraft, setRemoveDraft] = useState(false);

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    recentSessions(db, 3)
      .then((rows) => alive && setRecent(rows))
      .catch(() => alive && setRecent([]));
    return () => {
      alive = false;
    };
  }, [db, revision]);

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    activeDraft(db)
      .then((row) => alive && setDraft(row))
      .catch(() => alive && setDraft(null));
    return () => {
      alive = false;
    };
  }, [db, revision]);



  const continueDraft = async () => {
    if (db === undefined || draft === null || draft === 'loading') return;
    setBusy(true);
    try {
      if (draft.readOnly) await takeOwnership(db, `workout:${draft.sessionId}`);
      const resumed = await resumeDraft(db, draft.sessionId);
      onResume(resumed);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось открыть тренировку');
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

  return (
    <div className="screen screen--home">
      <header className="topbar">
        <h1 className="topbar__title topbar__title--greeting">
          {name !== undefined ? `Привет, ${name}` : 'Привет!'}
        </h1>
      </header>

      <div className="screen__body">
        {actionError && <p className="body-error" role="alert">{actionError}</p>}
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
                  {typeLabel(draft.type)} <span className="wk-card__dot">·</span> {draft.volume}
                </p>
                <p className="resume__meta">
                  Начата {formatDay(draft.startedAt)} · {draft.doneSets}/{draft.totalSets} подходов
                </p>
              </div>
            </div>
            <div className="resume__actions">
              <button className="btn btn--primary btn--sm" onClick={() => void continueDraft()} disabled={busy}>
                {draft.readOnly ? 'Продолжить на этом устройстве' : 'Продолжить'}
              </button>
              <button
                className="btn btn--ghost btn--sm resume__danger"
                onClick={() => setRemoveDraft(true)}
                disabled={busy || draft.readOnly}
              >
                Удалить черновик
              </button>
            </div>
          </section>
        )}

        <section className="hero" aria-label="Новая тренировка">
          <span className="hero__circle" aria-hidden>
            <img className="hero__icon" src={fitnessIcon} alt="" />
          </span>
          <div className="hero__copy">
            <span className="hero__chip">
              <span className="hero__chip-dot" aria-hidden />
              Готов двигаться?
            </span>
            <h2 className="hero__title">
              {draft !== null && draft !== 'loading' ? (
                <>
                  Продолжить
                  <br />
                  тренировку
                </>
              ) : (
                <>
                  Поймай
                  <br />
                  свой ритм
                </>
              )}
            </h2>
            <p className="hero__sub">Собери занятие под себя</p>
          </div>
          <button className="hero__cta" onClick={onCreate}>
            <span className="hero__cta-label">Выбрать тренировку</span>
            <IconArrowRight className="hero__cta-arrow" />
          </button>
        </section>

        <section className="recent" aria-label="Последние тренировки">
          <div className="section-head">
            <h2 className="section-title">Последние тренировки</h2>
            <button className="section-more" onClick={onOpenActivity}>
              Все
              <IconChevronRight />
            </button>
          </div>

          {recent === 'loading' ? null : recent.length === 0 ? (
            <div className="recent-empty">Здесь появится история выполненных тренировок</div>
          ) : (
            <div className="recent-list">
              {recent.map((item) => (
                <button
                  key={item.id}
                  className="recent-row"
                  onClick={() => onOpenSession(item.id)}
                  aria-label={`Открыть тренировку ${typeLabel(item.type)}, ${formatDay(item.completedAt)}`}
                >
                  <span className="recent-row__plate" aria-hidden>
                    {typeIcon(item.type)}
                  </span>
                  <span className="recent-row__body">
                    <span className="recent-row__title">{typeLabel(item.type)}</span>
                    <span className="recent-row__sub">
                      {formatDay(item.completedAt)} ·{' '}
                      {plural(item.done, ['упражнение', 'упражнения', 'упражнений'])}
                    </span>
                  </span>
                  <span className="recent-row__value">{formatDurationMs(item.durationMs)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

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
