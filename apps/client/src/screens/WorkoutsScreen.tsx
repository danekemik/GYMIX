import { queryReadModel } from '../data/local/read-rpc';
import { useLocalRead } from '../hooks/useLocalRead';
import { takeOwnership } from '../data/sync/engine';
import { useRef, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useDialogFocus } from '../hooks/useDialogFocus';
import fitnessIcon from '../assets/fitness.png';
import { SettingsButton } from '../components/SettingsButton';
import { WeekActivity } from '../components/WeekActivity';
import type { Draft } from '../lib/draft';
import { getUserName } from '../lib/account';
import { plural } from '../lib/draft';
import { formatDay, formatDurationMs } from '../lib/format';
import { IconArrowRight, IconChevronRight, IconTrash } from '../lib/icons';
import { typeIcon } from '../lib/typeIcon';
import {
  deleteDraft,
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
  onRepeat,
  onOpenActivity,
  onOpenSession,
  onResume,
}: WorkoutsScreenProps) {
  const { db, error } = useDb();
  const name = getUserName();
  const historyRead = useLocalRead<HistoryItem[]>('history');
  const draftRead = useLocalRead<DraftSummary | null>('active');
  const recent = historyRead.data?.slice(0, 2) ?? 'loading';
  const draft = draftRead.data === undefined ? 'loading' : draftRead.data;
  const draftLoading = draft === 'loading';
  const activeDraft = draft !== 'loading' ? draft : null;
  const loadError = Boolean(historyRead.error || draftRead.error);
  // Повтор последней и быстрый старт показываем, только когда они реально есть:
  // пустая секция не должна занимать место над неделей.
  const lastSession = !draftLoading && draft === null && recent !== 'loading' ? recent[0] : undefined;
  const showQuickBuild = !draftLoading && draft === null && quickDraft !== undefined;
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeDraft, setRemoveDraft] = useState(false);
  const [startNew, setStartNew] = useState(false);
  const removeDialog = useRef<HTMLDivElement>(null);
  const startDialog = useRef<HTMLDivElement>(null);
  useDialogFocus(removeDialog, removeDraft, () => { if (!busy) setRemoveDraft(false); });
  useDialogFocus(startDialog, startNew, () => { if (!busy) setStartNew(false); });

  const continueDraft = async () => {
    if (db === undefined || draft === null || draft === 'loading') return;
    setActionError('');
    setBusy(true);
    try {
      if (draft.readOnly) await takeOwnership(db, `workout:${draft.sessionId}`);
      const resumed = await queryReadModel<ResumedSession>(db, `resume:${draft.sessionId}`);
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
      await draftRead.reload();
    } catch {
      setActionError('Не удалось удалить черновик. Попробуй ещё раз.');
    } finally {
      setBusy(false);
      setRemoveDraft(false);
    }
  };

  const startNewWorkout = async () => {
    if (db === undefined || draft === null || draft === 'loading') return;
    setBusy(true);
    setActionError('');
    try {
      await deleteDraft(db, draft.sessionId);
      await draftRead.reload();
      setStartNew(false);
      onCreate();
    } catch {
      setActionError('Не удалось удалить черновик. Попробуй ещё раз.');
      setStartNew(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen screen--home">
      <header className="topbar">
        <h1 className="topbar__title topbar__title--greeting">{name ? `Привет, ${name}` : 'Привет!'}</h1>
        <SettingsButton onClick={onSettings} />
      </header>

      <div className="screen__body">
        {loadError && <div className="note note--error" role="alert">Не удалось загрузить тренировки. <button className="text-action" onClick={() => { void historyRead.reload(); void draftRead.reload(); }}>Повторить</button></div>}
        {actionError && <p className="body-error" role="alert">{actionError}</p>}
        {error !== undefined && (
          <div className="note note--error" role="alert">
            Не удалось открыть локальную базу. Перезагрузи приложение — данные на устройстве сохранятся.
          </div>
        )}

        <section className={`hero${activeDraft ? ' hero--active' : ''}`} aria-label={activeDraft ? 'Текущая тренировка' : 'Новая тренировка'} aria-busy={draftLoading || undefined}>
          <span className="hero__circle" aria-hidden="true">
            <img className="hero__icon" src={fitnessIcon} alt="" width={46} height={46} />
          </span>
          <div className="hero__copy">
            <span className="hero__chip"><span className="hero__chip-dot" aria-hidden="true" />{activeDraft ? 'Текущая тренировка' : 'Готов двигаться?'}</span>
            <h2 className="hero__title">{draftLoading ? 'Загружаем тренировку' : activeDraft ? typeLabel(activeDraft.type) : 'Поймай свой ритм'}</h2>
            <p className="hero__sub">{draftLoading ? 'Секунду…' : activeDraft ? `${activeDraft.volume} · ${formatDay(activeDraft.startedAt)}` : 'Собери занятие под себя'}</p>
          </div>
          {activeDraft && (
            <div className="hero__progress">
              <span id="draft-progress">{activeDraft.doneSets} из {activeDraft.totalSets} подходов выполнено</span>
              <progress aria-labelledby="draft-progress" value={activeDraft.doneSets} max={Math.max(1, activeDraft.totalSets)} />
            </div>
          )}
          <button className="hero__cta" onClick={activeDraft ? () => void continueDraft() : onCreate} disabled={busy || draftLoading} aria-describedby={activeDraft?.readOnly ? 'draft-ownership' : undefined}>
            <span className="hero__cta-label">{draftLoading ? 'Проверяем…' : busy ? 'Открываем…' : activeDraft ? activeDraft.readOnly ? 'Продолжить здесь' : 'Продолжить тренировку' : 'Начать тренировку'}</span><IconArrowRight className="hero__cta-arrow" />
          </button>
          {activeDraft && (activeDraft.readOnly ? (
            <p className="hero__ownership" id="draft-ownership">Занятие открыто на другом устройстве. Можно продолжить на этом.</p>
          ) : (
            <div className="hero__actions">
              <button className="hero__secondary" onClick={() => setStartNew(true)} disabled={busy}>
                Начать новую
              </button>
              <button className="hero__discard" onClick={() => setRemoveDraft(true)} disabled={busy} aria-label="Удалить черновик"><IconTrash className="hero__discard-icon" /></button>
            </div>
          ))}
        </section>

        {(lastSession !== undefined || showQuickBuild) && (
        <section className="today-links" aria-label="Другие варианты старта">
          {lastSession !== undefined && (
            <button className="journal-link" disabled={busy} aria-label={`${busy ? 'Открываем…' : 'Повторить последнюю'} ${typeLabel(lastSession.type)} · ${formatDay(lastSession.completedAt)}`} onClick={() => {
              setBusy(true); setActionError('');
              void onRepeat(lastSession.id).catch(() => setActionError('Не удалось повторить тренировку. Попробуй ещё раз.')).finally(() => setBusy(false));
            }}>
              <span><strong>{busy ? 'Открываем…' : 'Повторить последнюю'}</strong>{' '}<small>{typeLabel(lastSession.type)} · {formatDay(lastSession.completedAt)}</small></span><IconChevronRight />
            </button>
          )}
          {showQuickBuild && quickDraft !== undefined && (
            <button className="journal-link" disabled={busy} onClick={onQuickBuild} aria-label={`Новый состав по прошлым настройкам · ${typeLabel(quickDraft.type)}`}><span><strong>Новый состав</strong>{' '}<small>По прошлым настройкам · {typeLabel(quickDraft.type)}</small></span><IconChevronRight /></button>
          )}
        </section>
        )}

        {(lastSession !== undefined || showQuickBuild) && <WeekActivity variant="timeline" title="На неделе" hideWhenEmpty />}

        <section className="recent" aria-label="Последние тренировки">
          <div className="section-head">
            <h2 className="section-title">Последние тренировки</h2>
            <button className="section-more" onClick={onOpenActivity}>
              История
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
          <div ref={removeDialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="remove-draft-title">
            <h2 id="remove-draft-title" className="dialog__title">
              Удалить черновик?
            </h2>
            <p className="dialog__text">
              Прогресс текущей тренировки будет стёрт. Это действие нельзя
              отменить.
            </p>
            <div className="dialog__actions">
              <button className="btn btn--danger" onClick={() => void confirmDeleteDraft()} disabled={busy}>
                {busy ? 'Удаляем…' : 'Удалить'}
              </button>
              <button className="btn btn--ghost" onClick={() => setRemoveDraft(false)} disabled={busy} autoFocus>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {startNew && (
        <div className="overlay">
          <div ref={startDialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="start-new-title">
            <h2 id="start-new-title" className="dialog__title">
              Начать новую тренировку?
            </h2>
            <p className="dialog__text">
              Текущий черновик будет удалён, а его прогресс — потерян.
            </p>
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => void startNewWorkout()} disabled={busy}>
                {busy ? 'Удаляем…' : 'Начать новую'}
              </button>
              <button className="btn btn--ghost" onClick={() => setStartNew(false)} disabled={busy} autoFocus>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
