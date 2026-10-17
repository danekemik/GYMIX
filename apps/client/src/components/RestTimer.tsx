import { useEffect, useState } from 'react';

/** Optional wall-clock rest timer; independent of recorded workout duration. */
export function RestTimer({ sessionId }: { sessionId: string | undefined }) {
  const [seconds, setSeconds] = useState(90);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    try {
      const saved = sessionId ? JSON.parse(sessionStorage.getItem(`gymix:rest:${sessionId}`) ?? 'null') : null;
      setDeadline(saved && Number.isFinite(saved.deadline) && saved.deadline > 0 ? saved.deadline : null);
      if (saved && [60, 90, 120].includes(saved.seconds)) setSeconds(saved.seconds);
    } catch { setDeadline(null); }
    setNow(Date.now());
    setReady(true);
  }, [sessionId]);
  useEffect(() => {
    if (!sessionId || !ready) return;
    try {
      if (deadline === null) sessionStorage.removeItem(`gymix:rest:${sessionId}`);
      else sessionStorage.setItem(`gymix:rest:${sessionId}`, JSON.stringify({ deadline, seconds }));
    } catch { /* Timer remains usable without storage. */ }
  }, [deadline, seconds, sessionId, ready]);
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => { const current = Date.now(); setNow(current); if (current >= deadline) window.clearInterval(timer); }, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const remaining = deadline === null ? seconds : Math.max(0, Math.ceil((deadline - now) / 1000));
  const finished = deadline !== null && remaining === 0;
  return <details className="rest-timer">
    <summary>Отдых между подходами <span>{finished ? 'Завершён' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span></summary>
    <div className="rest-timer__controls">
      <div className="rest-timer__presets" role="group" aria-label="Длительность отдыха">{[60, 90, 120].map(value => <button key={value} aria-pressed={seconds === value} onClick={() => { setSeconds(value); setDeadline(null); }}>{value} с</button>)}</div>
      <button className="btn btn--ghost btn--sm" disabled={!sessionId || !ready} onClick={() => { setNow(Date.now()); setDeadline(deadline !== null && !finished ? null : Date.now() + seconds * 1000); }}>{deadline !== null && !finished ? 'Сбросить' : 'Начать отдых'}</button>
    </div>
    <p className="rest-timer__hint" role="status">{finished ? 'Отдых завершён. Продолжай, когда будешь готов.' : 'Запускай по необходимости. Таймер продолжает отсчёт в фоне.'}</p>
  </details>;
}
