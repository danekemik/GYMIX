import '@fontsource-variable/unbounded';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PhonePreview } from './components/PhonePreview';
import { registerOfflineSupport } from './lib/offline';

registerOfflineSupport();
import { AuthScreen } from './screens/AuthScreen';
import { useAuth } from './hooks/useAuth';
import { DbProvider } from './hooks/useDb';
import './styles/app.css';
import './styles/builder.css';
import './styles/button.css';
import './styles/flow.css';
import './styles/global.css';
import './styles/history.css';
import './styles/screen.css';
import './styles/segmented.css';
import './styles/slots.css';
import './styles/tabbar.css';
import './styles/topbar.css';
import './styles/type-list.css';
import './styles/workouts.css';
import './styles/device.css';
import './styles/refinements.css';
import './styles/journal.css';
import './styles/home.css';

const root = document.getElementById('root');
if (!root) throw new Error('нет #root');

function StatusBar() {
  return (
    <div className="phone__statusbar" aria-hidden="true">
      <span className="phone__clock">9:41</span>
      <span className="phone__status-right">
        <svg viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="4.5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="9" y="3" width="3" height="9" rx="1" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg viewBox="0 0 18 13" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M1 4.6a11 11 0 0 1 16 0" strokeLinecap="round" />
          <path d="M4 7.8a6.6 6.6 0 0 1 10 0" strokeLinecap="round" />
          <path d="M7 11a2.6 2.6 0 0 1 4 0" strokeLinecap="round" />
        </svg>
        <svg viewBox="0 0 26 13" fill="none">
          <rect x="0.8" y="0.8" width="22" height="11.4" rx="3.4" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
          <rect x="2.4" y="2.4" width="16" height="8.2" rx="2" fill="currentColor" />
          <path d="M24.6 4.4v4.2a2.2 2.2 0 0 0 0-4.2Z" fill="currentColor" fillOpacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

function AccountApp({ children }: { children: import('react').ReactNode; }) {
  const session = useAuth();
  if (!session) return <div className="app"><AuthScreen /></div>;
  return <DbProvider key={`${session.user.id}:${session.deviceId}`} account={{ userId: session.user.id, email: session.user.email, deviceId: session.deviceId }}>{children}</DbProvider>;
}

createRoot(root).render(
  <StrictMode>
    <PhonePreview>
      <StatusBar />
      <AccountApp><App /></AccountApp>
    </PhonePreview>
  </StrictMode>,
);
