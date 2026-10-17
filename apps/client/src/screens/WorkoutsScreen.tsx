import { takeOwnership } from '../data/sync/engine';
import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
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
        <div><p className="today-date">{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}</p><h1 className="topbar__title">Сегодня</h1></div>
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

        {draft === 'loading' ? <div className="today-start" aria-busy="true"><p className="body-muted">Проверяем сохранённые тренировки…</p></div> : draft === null && (
          <section className="today-start" aria-label="Начать тренировку">
            <p className="eyebrow">{name ? `${name}, с возвращением` : 'Быстрый старт'}</p>
            <h2 className="today-start__title">{recent !== 'loading' && recent.length ? typeLabel(recent[0]!.type) : 'Начни с первой тренировки'}</h2>
            {recent !== 'loading' && recent.length > 0 ? <>
              <p className="body-muted">Последний раз: {formatDay(recent[0]!.completedAt)} · {plural(recent[0]!.total, ['упражнение', 'упражнения', 'упражнений'])}</p>
              <button className="btn btn--primary" disabled={busy} onClick={() => {
                setBusy(true); setActionError('');
                void onRepeat(recent[0]!.id).catch(() => setActionError('Не удалось повторить тренировку. Попробуй ещё раз.')).finally(() => setBusy(false));
              }}>{busy ? 'Открываем…' : 'Повторить последнюю'}<IconArrowRight /></button>
              <button className="text-action" onClick={onCreate} disabled={busy}>Собрать другую тренировку</button>
            </> : <>
              <p className="body-muted">Выбери формат и состав. Вес и повторы запишешь во время занятия.</p>
              <button className="btn btn--primary" onClick={onCreate}>Собрать тренировку<IconArrowRight /></button>
            </>}
          </section>
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
