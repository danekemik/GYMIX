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

/* Объёмная гантель для лаймовой карточки: металлический гриф с бликом,
 * крупные чёрные диски с тонкими лаймовыми кольцами, мягкая тень и
 * полупрозрачные дуги на фоне. */
export function IconDumbbellArt({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 132 96" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gym-metal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#41494f" />
          <stop offset="0.5" stopColor="#7d868d" />
          <stop offset="1" stopColor="#2f353a" />
        </linearGradient>
      </defs>

      <ellipse cx="66" cy="88" rx="44" ry="7" fill="rgba(10,12,8,0.25)" />

      <circle cx="118" cy="18" r="24" stroke="rgba(168,245,58,0.32)" strokeWidth="2" />
      <path
        d="M10 66a34 34 0 0 1 40 -14"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <g transform="rotate(-16 66 46)">
        <rect x="34" y="38" width="64" height="13" rx="6.5" fill="url(#gym-metal)" />
        <rect x="37" y="40.5" width="58" height="3" rx="1.5" fill="rgba(255,255,255,0.32)" />
        <rect x="56" y="41.5" width="1.6" height="6" rx="0.8" fill="rgba(168,245,58,0.35)" />
        <rect x="61.5" y="41.5" width="1.6" height="6" rx="0.8" fill="rgba(168,245,58,0.35)" />
        <rect x="67" y="41.5" width="1.6" height="6" rx="0.8" fill="rgba(168,245,58,0.35)" />
        <rect x="72.5" y="41.5" width="1.6" height="6" rx="0.8" fill="rgba(168,245,58,0.35)" />

        <rect x="43" y="34.5" width="13" height="20" rx="4.5" fill="#0e1113" stroke="#23272b" strokeWidth="1" />
        <rect x="76" y="34.5" width="13" height="20" rx="4.5" fill="#0e1113" stroke="#23272b" strokeWidth="1" />

        <rect x="20" y="28" width="18" height="33" rx="7" fill="#0a0c0d" stroke="#262b30" strokeWidth="1.4" />
        <rect x="25" y="31.5" width="8" height="26" rx="4" fill="none" stroke="#a8f53a" strokeWidth="1.3" />

        <rect x="94" y="28" width="18" height="33" rx="7" fill="#0a0c0d" stroke="#262b30" strokeWidth="1.4" />
        <rect x="99" y="31.5" width="8" height="26" rx="4" fill="none" stroke="#a8f53a" strokeWidth="1.3" />

        <path
          d="M20.5 30.5l2.5 4.5M109.5 30.5l-2.5 4.5"
          stroke="rgba(168,245,58,0.5)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}