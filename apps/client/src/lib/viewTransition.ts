import { flushSync } from 'react-dom';

/**
 * Выполняет обновление состояния внутри нативного View Transition, если браузер
 * его поддерживает и пользователь не просил уменьшить движение. Иначе обновление
 * применяется мгновенно — переход просто не анимируется.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as unknown as {
    startViewTransition?: (callback: () => void) => unknown;
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof doc.startViewTransition !== 'function' || reduceMotion) {
    update();
    return;
  }

  try {
    doc.startViewTransition(() => {
      flushSync(update);
    });
  } catch {
    update();
  }
}
