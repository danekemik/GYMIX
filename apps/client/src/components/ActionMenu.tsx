import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { IconDots } from '../lib/icons';

interface ActionMenuProps {
  /** Доступное имя кнопки меню. */
  label: string;
  children: (close: () => void) => ReactNode;
  className?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
}

/**
 * Компактное меню действий (popover): закрывается по клику вне и Escape,
 * после действия, не наследует opacity родительской карточки.
 */
export function ActionMenu({ label, children, className, align = 'end', disabled = false }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus());
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open]);

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown'
      ? (current + 1) % items.length
      : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={root} className={`action-menu${className ? ` ${className}` : ''}`}>
      <button
        ref={trigger}
        type="button"
        className="action-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <IconDots className="action-menu__icon" />
      </button>
      {open && (
        <div
          ref={panel}
          className={`action-menu__panel action-menu__panel--${align}`}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
        >
          {children(() => {
            // Возвращаем фокус на триггер до коммита: если пункт открывает
            // диалог, focus-trap запомнит триггер и вернёт фокус после закрытия.
            setOpen(false);
            trigger.current?.focus({ preventScroll: true });
          })}
        </div>
      )}
    </div>
  );
}
