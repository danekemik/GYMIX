import { takeOwnership } from '../data/sync/engine';
import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
import fitnessIcon from '../assets/fitness.png';
import { SettingsButton } from '../components/SettingsButton';
import { WeekActivity } from '../components/WeekActivity';
import type { Draft } from '../lib/draft';
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
  onSettings: () => void;
  onQuickBuild: () => void;
  quickDraft: Draft | undefined;
  onCreate: () => void;
  onOpenTemplates: () => void;
  onRepeat: (sessionId: string) => Promise<void>;
  onOpenActivity: () => void;
  onOpenSession: (sessionId: string) => void;
  onResume: (session: ResumedSession) => void;
}

export function WorkoutsScreen({
  onSettings,
  onQuickBuild,
  quickDraft,
  onCreate,
  onOpenTemplates,
  onRepeat,
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
  const [loadKey, setLoadKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [removeDraft, setRemoveDraft] = useState(false);

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    recentSessions(db, 3)
      .then((rows) => alive && setRecent(rows))
      .catch(() => { if (alive) setLoadError(true); });
    return () => {
      alive = false;
    };
  }, [db, revision, loadKey]);

  useEffect(() => {
    if (db === undefined) return;
    let alive = true;
    activeDraft(db)
      .then((row) => alive && setDraft(row))
      .catch(() => { if (alive) setLoadError(true); });
    return () => {
      alive = false;
    };
  }, [db, revision, loadKey]);



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
        <h1 className="topbar__title topbar__title--greeting">{name ? `Привет, ${name}` : 'Привет!'}</h1>
        <SettingsButton onClick={onSettings} />
      </header>

      <div className="screen__body">
        {loadError && <div className="note note--error" role="alert">Не удалось загрузить тренировки. <button className="text-action" onClick={() => { setLoadError(false); setLoadKey(value => value + 1); }}>Повторить</button></div>}
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
          <span className="hero__circle" aria-hidden="true">
            <img className="hero__icon" src={fitnessIcon} alt="" width={46} height={46} />
          </span>
          <div className="hero__copy">
            <span className="hero__chip"><span className="hero__chip-dot" aria-hidden="true" />Готов двигаться?</span>
            <h2 className="hero__title">Поймай<br />свой ритм</h2>
            <p className="hero__sub">Собери занятие под себя</p>
          </div>
          <button className="hero__cta" onClick={onCreate} disabled={busy || draft !== null} aria-describedby={draft !== null ? 'start-availability' : undefined}>
            <span className="hero__cta-label">Начать тренировку</span><IconArrowRight className="hero__cta-arrow" />
          </button>
          {draft !== null && <p id="start-availability" className="hero__availability">{draft === 'loading' ? 'Проверяем сохранённую тренировку…' : 'Сначала заверши текущее занятие или продолжи его выше.'}</p>}
        </section>

        {draft === null && recent !== 'loading' && recent.length > 0 && (
          <button className="btn btn--ghost repeat-last" disabled={busy} onClick={() => {
            setBusy(true); setActionError('');
            void onRepeat(recent[0]!.id).catch(() => setActionError('Не удалось повторить тренировку. Попробуй ещё раз.')).finally(() => setBusy(false));
          }}>
            <span><strong>{busy ? 'Открываем…' : 'Повторить последнюю'}</strong><small>{typeLabel(recent[0]!.type)} · {formatDay(recent[0]!.completedAt)}</small></span><IconChevronRight />
          </button>
        )}

        <WeekActivity />

        <section className="today-links" aria-label="Другие варианты старта">
          <button className="journal-link" onClick={onOpenTemplates}><span><strong>Мои тренировки</strong><small>Сохранённые варианты для быстрого старта</small></span><IconChevronRight /></button>
          {quickDraft && <button className="journal-link" disabled={busy || draft !== null} onClick={onQuickBuild}><span><strong>Новый состав по прошлым настройкам</strong><small>{typeLabel(quickDraft.type)} · {quickDraft.volume}{quickDraft.mgsGroup ? ` · ${quickDraft.mgsGroup}` : ''}</small></span><IconChevronRight /></button>}
        </section>

        <section className="recent" aria-label="Последние тренировки">
          <div className="section-head">
            <h2 className="section-title">Последние тренировки</h2>
            <button className="section-more" onClick={onOpenActivity}>
              Все
              <IconChevronRight />
            </button>
          </div>

          {recent === 'loading' ? <p className="body-muted">Загружаем историю…</p> : recent.length === 0 ? (
            <div className="recent-empty">После занятия здесь будут его результаты: упражнения, подходы и время.</div>
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
