import { typeLabel } from '../lib/workoutTypes';
import { plural } from '../lib/draft';
import { useLocalRead } from '../hooks/useLocalRead';
import { useState } from 'react';
import { useDb } from '../hooks/useDb';
import { formatDay } from '../lib/format';
import { IconDots, IconTorso } from '../lib/icons';
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

/** «Мои тренировки» — сохранённые шаблоны, вынесены с главного экрана. */
export function TemplatesScreen({
  onOpenTemplate,
  onEditTemplate,
  onCreate,
}: TemplatesScreenProps) {
  const { db } = useDb();
  const { data, error: loadError, reload } = useLocalRead<TemplateCard[]>('templates');
  const templates = data ?? 'loading';
  const [menuFor, setMenuFor] = useState<MenuTarget>(null);
  const [renameFor, setRenameFor] = useState<MenuTarget>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removeFor, setRemoveFor] = useState<MenuTarget>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  const doRename = async () => {
    const title = renameValue.trim();
    if (title === '' || db === undefined || renameFor === null) return;
    setBusy(true); setActionError('');
    try {
      await renameTemplate(db, renameFor.id, title, renameFor.title);
      setRenameFor(null);
      await reload();
      setFeedback('Шаблон переименован.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось переименовать шаблон.');
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async () => {
    if (db === undefined || menuFor === null) return;
    setBusy(true); setActionError(''); setFeedback('');
    try {
      await copyTemplate(db, menuFor.id);
      setMenuFor(null);
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
    setBusy(true);
    try {
      await deleteTemplate(db, removeFor.id);
      setRemoveFor(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library__content">
      <div className="screen__body">
        {actionError && <p className="body-error" role="alert">{actionError}</p>}
        {feedback && <p className="note" role="status">{feedback}</p>}
        <section className="mine" aria-label="Мои тренировки">
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
                  <button
                    className="wk-card__menu"
                    aria-label="Меню шаблона"
                    onClick={() => setMenuFor(template)}
                  >
                    <IconDots />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
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
    </div>
  );
}
