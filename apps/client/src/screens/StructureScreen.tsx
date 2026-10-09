import { plural, rosterRows, structureFor, type Draft } from '../lib/draft';

interface StructureScreenProps {
  draft: Draft;
  onBack: () => void;
  onBackVolume: () => void;
}

export function StructureScreen({ draft, onBack, onBackVolume }: StructureScreenProps) {
  const structure = structureFor(draft);
  const rows = rosterRows(structure.slots);
  const filled = 0;
  const total = structure.exerciseCount;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Структура</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{draft.type}</span>
          <span className="volume-head__meta">
            {draft.volume} · {plural(total, ['упражнение', 'упражнения', 'упражнений'])}
          </span>
        </div>

        <div className="progress">
          <span className="progress__label">
            Заполнено {filled} из {plural(total, ['слота', 'слотов', 'слотов'])}
          </span>
          <span className="progress__track" aria-hidden>
            <span className="progress__bar" style={{ width: `${(filled / total) * 100}%` }} />
          </span>
        </div>

        <ol className="structure">
          {rows.map((row) => (
            <li key={row.key} className="structure__row">
              <span className="structure__group">
                {row.label}
                {row.alt && <em className="slots__alt">или {row.alt}</em>}
              </span>
              <span className="structure__side">
                <span className="slots__count">{row.count} ×</span>
                <span className="structure__status">не выбрано</span>
              </span>
            </li>
          ))}
        </ol>

        <aside className="note">
          Число слотов фиксировано — это структура тренировки. Упражнения
          выбираются внутри слотов на следующем шаге.
        </aside>

        <div className="screen__cta">
          <button className="btn btn--ghost" onClick={onBackVolume}>
            Изменить объём
          </button>
        </div>
      </div>
    </div>
  );
}