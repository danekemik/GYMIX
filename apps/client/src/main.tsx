import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import './styles/builder.css';
import './styles/button.css';
import './styles/device.css';
import './styles/flow.css';
import './styles/global.css';
import './styles/history.css';
import './styles/screen.css';
import './styles/segmented.css';
import './styles/slots.css';
import './styles/tabbar.css';
import './styles/topbar.css';
import './styles/type-card.css';
import './styles/workouts.css';

const root = document.getElementById('root');
if (!root) throw new Error('нет #root');

createRoot(root).render(
  <StrictMode>
    <div className="device">
      <App />
    </div>
  </StrictMode>,
);