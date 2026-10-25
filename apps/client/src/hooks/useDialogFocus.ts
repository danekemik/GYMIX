import { useEffect, useRef, type RefObject } from 'react';

/** Keeps keyboard input in the active dialog and restores focus on close. */
export function useDialogFocus(root: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, context?: unknown) {
  const close = useRef(onClose);
  close.current = onClose;
  // Запоминаем элемент до открытия: autoFocus внутри диалога успевает
  // перехватить фокус ещё во время коммита, поэтому читать activeElement
  // в эффекте уже поздно.
  const restoreTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && document.activeElement instanceof HTMLElement) {
    restoreTo.current = document.activeElement;
  }
  wasOpen.current = open;
  useEffect(() => {
    const dialog = root.current;
    if (!open || !dialog) return;
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [href], [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) {
      dialog.tabIndex = -1;
      (controls()[0] ?? dialog).focus();
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = controls(); const first = elements[0]; const last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      const previous = restoreTo.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [root, open, context]);
}
