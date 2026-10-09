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
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tabbar__tab ${active === tab.id ? 'tabbar__tab--on' : ''}`}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span className="tabbar__icon" aria-hidden>
            {tab.icon}
          </span>
          <span className="tabbar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}