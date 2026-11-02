export function SettingsButton({ onClick }: { onClick: () => void }) {
  return <button className="topbar__icon-btn" aria-label="Настройки" onClick={onClick}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9.5 4.5 10 2h4l.5 2.5 2 1.2L19 5l2 3.5-1.7 1.8v2.4L21 14.5 19 18l-2.5-.7-2 1.2L14 21h-4l-.5-2.5-2-1.2L5 18l-2-3.5 1.7-1.8v-2.4L3 8.5 5 5l2.5.7Z" strokeLinejoin="round" />
      <circle cx="12" cy="11.5" r="3" />
    </svg>
  </button>;
}
