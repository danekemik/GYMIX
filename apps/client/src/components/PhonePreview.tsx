import { useEffect, useState, type ReactNode } from 'react';

const WIDTH = 417;
const HEIGHT = 876;

/** Local review frame: a 393 × 852 CSS-pixel screen, scaled as one unit. */
export function PhonePreview({ children }: { children: ReactNode }) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const measure = () => ({
    framed: local && window.innerWidth >= 600,
    scale: Math.min(1, (window.innerHeight - 64) / HEIGHT, (window.innerWidth - 64) / WIDTH),
  });
  const [view, setView] = useState(measure);
  useEffect(() => {
    const resize = () => setView(measure());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [local]);
  return (
    <div className={view.framed ? 'preview-stage' : 'mobile-stage'}>
      {view.framed && <p className="preview-caption">GYMIX <span>iPhone · 393 × 852</span></p>}
      <div className="preview-size" style={view.framed ? { width: WIDTH * view.scale, height: HEIGHT * view.scale } : undefined}>
        <div className={`phone${view.framed ? ' phone--preview' : ''}`} style={view.framed ? { transform: `scale(${view.scale})` } : undefined}>
          <div className="device">{children}</div>
          <span className="phone__island" aria-hidden="true" />
          <span className="phone__home" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
