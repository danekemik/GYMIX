import type { ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon: ReactNode;
}

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      {activeIndex >= 0 && (
        <span
          className="tabbar__indicator"
          aria-hidden
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
      )}
      {tabs.map((tab) => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`tabbar__tab ${on ? 'tabbar__tab--on' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            <span className="tabbar__icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="tabbar__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}