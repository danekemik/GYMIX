import { typeLabel } from '../lib/workoutTypes';
import { plural } from '../lib/draft';
import { useLocalRead } from '../hooks/useLocalRead';
import { useEffect, useRef, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { formatDay } from '../lib/format';
import { ActionMenu } from '../components/ActionMenu';
import { IconTorso } from '../lib/icons';
import {
  copyTemplate,
  deleteTemplate,
  renameTemplate,
  type TemplateCard,
} from '../lib/templates';

interface TemplatesScreenProps {
  onOpenTemplate: (templateId: string) => void;
  onEditTemplate: (templateId: string) => void;
  onCreate: () => void;
}

type MenuTarget = TemplateCard | null;

/** Сохранённые шаблоны тренировок, вынесены с главного экрана. */
export function TemplatesScreen({
  onOpenTemplate,
  onEditTemplate,
  onCreate,
}: TemplatesScreenProps) {
  const { db } = useDb();
  const { data, error: loadError, reload } = useLocalRead<TemplateCard[]>('templates');
  const templates = data ?? 'loading';
  const [renameFor, setRenameFor] = useState<MenuTarget>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [removeFor, setRemoveFor] = useState<MenuTarget>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const renameDialog = useRef<HTMLDivElement>(null);
  const removeDialog = useRef<HTMLDivElement>(null);
  useDialogFocus(renameDialog, renameFor !== null, () => { if (!busy) setRenameFor(null); });
  useDialogFocus(removeDialog, removeFor !== null, () => { if (!busy) setRemoveFor(null); });

  useEffect(() => {
    if (feedback === '') return;
    const timer = window.setTimeout(() => setFeedback(''), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const doRename = async () => {
    const title = renameValue.trim();
    if (db === undefined || renameFor === null) return;
    if (title === '') {
      setRenameError('Название не может быть пустым.');
      return;
    }
    setBusy(true); setActionError(''); setRenameError('');
    try {
      if (title !== renameFor.title) await renameTemplate(db, renameFor.id, title, renameFor.title);
      setRenameFor(null);
      await reload();
      if (title !== renameFor.title) setFeedback('Шаблон переименован.');
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Не удалось переименовать шаблон.');
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async (template: TemplateCard) => {
    if (db === undefined) return;
    setBusy(true); setActionError(''); setFeedback('');
    try {
      await copyTemplate(db, template.id);
      await reload();
      setFeedback('Копия шаблона создана.');
    } catch {
      setActionError('Не удалось скопировать шаблон. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (db === undefined || removeFor === null) return;
    setBusy(true); setActionError('');
    try {
      await deleteTemplate(db, removeFor.id);
      setRemoveFor(null);
      await reload();
      setFeedback('Шаблон удалён.');
    } catch {
      setActionError('Не удалось удалить шаблон. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library__content">
      <div className="screen__body">
        {actionError && <p className="body-error" role="alert">{actionError}</p>}
        {feedback && <p className="note" role="status">{feedback}</p>}
        <section className="mine" aria-label="Сохранённые шаблоны">
          {loadError && data === undefined ? <div className="note note--error" role="alert">Не удалось загрузить сохранённые тренировки.<button className="text-action" onClick={() => void reload()}>Повторить</button></div> : templates === 'loading' ? (
            <p className="body-muted">Загружаем тренировки…</p>
          ) : templates.length === 0 ? (
            <div className="empty-train">
              <p className="empty-train__title">Твои привычные тренировки</p>
              <p className="empty-train__text">
                Собери первую тренировку. После занятия сохрани её состав — он будет здесь для быстрого старта.
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
                        {typeLabel(template.type)} <span className="wk-card__dot">·</span>{' '}
                        {template.volume}
                      </span>
                      <span className="wk-card__tags">
                        <span className="wk-card__tag">{plural(template.exerciseCount, ['упражнение', 'упражнения', 'упражнений'])}</span>
                        <span className="wk-card__date">{formatDay(template.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                  <ActionMenu label={`Меню шаблона «${template.title}»`} disabled={busy}>
                    {(close) => (
                      <>
                        <button className="action-menu__item" role="menuitem" onClick={() => { close(); onOpenTemplate(template.id); }}>
                          Открыть
                        </button>
                        <button className="action-menu__item" role="menuitem" onClick={() => { close(); onEditTemplate(template.id); }}>
                          Редактировать состав
                        </button>
                        <button className="action-menu__item" role="menuitem" disabled={busy} onClick={() => { close(); void doCopy(template); }}>
                          Копировать
                        </button>
                        <button className="action-menu__item" role="menuitem" onClick={() => { close(); setRenameValue(template.title); setRenameError(''); setRenameFor(template); }}>
                          Переименовать
                        </button>
                        <span className="action-menu__group">
                          <button className="action-menu__item action-menu__item--danger" role="menuitem" onClick={() => { close(); setRemoveFor(template); }}>
                            Удалить
                          </button>
                        </span>
                      </>
                    )}
                  </ActionMenu>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {renameFor !== null && (
        <div className="overlay">
          <div ref={renameDialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title">
            <h2 id="rename-title" className="dialog__title">
              Переименовать шаблон
            </h2>
            <label className="field">
              <span className="field__label">Название</span>
              <input
                className="field__input"
                type="text"
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  if (renameError !== '') setRenameError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void doRename();
                }}
                aria-invalid={renameError !== ''}
                aria-describedby={renameError !== '' ? 'rename-error' : undefined}
                autoFocus
                maxLength={60}
              />
            </label>
            {renameError !== '' && (
              <p className="body-error" id="rename-error" role="alert">
                {renameError}
              </p>
            )}
            <div className="dialog__actions">
              <button className="btn btn--primary" onClick={() => void doRename()} disabled={busy || renameValue.trim() === ''}>
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
              <button className="btn btn--ghost" onClick={() => setRenameFor(null)} disabled={busy}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {removeFor !== null && (
        <div className="overlay">
          <div ref={removeDialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="remove-title">
            <h2 id="remove-title" className="dialog__title">
              Удалить шаблон?
            </h2>
            <p className="dialog__text">
              «{removeFor.title}» исчезнет без возможности восстановления. История
              тренировок не изменится.
            </p>
            <div className="dialog__actions">
              <button className="btn btn--danger" onClick={() => void doDelete()} disabled={busy}>
                {busy ? 'Удаляем…' : 'Удалить'}
              </button>
              <button className="btn btn--ghost" onClick={() => setRemoveFor(null)} disabled={busy} autoFocus>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
