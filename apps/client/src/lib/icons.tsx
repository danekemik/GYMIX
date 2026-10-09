import type { ReactNode } from 'react';

/* Единый набор иконок: stroke 2, скруглённые окончания, fill=currentColor. */

interface IconProps {
  className?: string | undefined;
}

function Base({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="m9 6 6 6-6 6" />
    </Base>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Base>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Base>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <Base className={className}>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M16 2v4M8 2v4M3 9.5h18" />
    </Base>
  );
}

export function IconList({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M8.5 6.5H21M8.5 12H21M8.5 17.5H21" />
      <path d="M3.5 6.5h.01M3.5 12h.01M3.5 17.5h.01" />
    </Base>
  );
}

export function IconDots({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5.5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="18.5" r="1.6" />
    </svg>
  );
}

export function IconGear({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34 1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
    </Base>
  );
}

/* Контурные пиктограммы типов: фигура / торс / ноги. */
export function IconFigure({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="4" r="2.2" />
      <path d="M12 6.5v5M12 8.5 6.5 6M12 8.5l5.5-2.5" />
      <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
      <path d="M9.5 11v4.5M14.5 11v4.5" />
    </Base>
  );
}

export function IconTorso({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="4.5" r="2.2" />
      <path d="M12 7.5v3" />
      <path d="M5 21c.6-4 3.2-6.2 7-6.2s6.4 2.2 7 6.2" />
    </Base>
  );
}

export function IconLegs({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M10.5 3.5v8M13.5 3.5v8" />
      <path d="M10.5 8.6 8.6 9.8M13.5 8.6l1.9 1.2" />
      <path d="m10 11.5-2.8 8.5M14 11.5l2.8 8.5" />
    </Base>
  );
}

/* Объёмная гантель для карточки создания: чёрные диски с тонкими
 * лаймовыми кольцами, мягкая тень и полупрозрачные дуги на фоне. */
export function IconDumbbellArt({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 124 116" fill="none" aria-hidden="true">
      <circle cx="100" cy="14" r="46" stroke="rgba(10,12,8,0.16)" strokeWidth="2.5" />
      <circle cx="100" cy="14" r="32" stroke="rgba(10,12,8,0.13)" strokeWidth="2" />
      <ellipse cx="62" cy="102" rx="40" ry="6" fill="rgba(10,12,8,0.22)" />
      <g transform="rotate(-16 62 58)">
        <rect x="56" y="40" width="12" height="36" rx="6" fill="#0b0d0e" />
        <rect x="58" y="43" width="8" height="30" rx="4" fill="#23272b" />
        <rect x="36" y="37" width="20" height="42" rx="8" fill="#0b0d0e" />
        <rect x="39" y="40" width="14" height="36" rx="6" fill="none" stroke="#a8f53a" strokeWidth="1.6" />
        <rect x="20" y="32" width="16" height="52" rx="7.5" fill="#0b0d0e" />
        <rect x="22.5" y="35" width="11" height="46" rx="5" fill="none" stroke="#a8f53a" strokeWidth="1.4" />
        <rect x="68" y="37" width="20" height="42" rx="8" fill="#0b0d0e" />
        <rect x="71" y="40" width="14" height="36" rx="6" fill="none" stroke="#a8f53a" strokeWidth="1.6" />
        <rect x="88" y="32" width="16" height="52" rx="7.5" fill="#0b0d0e" />
        <rect x="90.5" y="35" width="11" height="46" rx="5" fill="none" stroke="#a8f53a" strokeWidth="1.4" />
        <circle cx="62" cy="58" r="2" fill="#a8f53a" />
      </g>
    </svg>
  );
}