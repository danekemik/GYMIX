import { plural, rosterRows, structureFor, type Draft } from '../lib/draft';

interface StructureScreenProps {
  draft: Draft;
  onBack: () => void;
  onBackVolume: () => void;
  onManual: () => void;
  onGenerate: () => void;
}

export function StructureScreen({ draft, onBack, onBackVolume, onManual, onGenerate }: StructureScreenProps) {
  const structure = structureFor(draft);
  const rows = rosterRows(structure.slots);
  const total = structure.exerciseCount;
  const filled = Object.values(draft.selections ?? {}).filter((name) => name.length > 0).length;

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
          {rows.map((row) => {
            const rowFilled = draft.selections === undefined
              ? 0
              : structure.slots
                  .filter((slot) => {
                    const label = slot.allowedGroupIds[0] ?? 'Слот';
                    const alt = slot.alternativeGroupIds.join(' или ');
                    return alt ? `${label}±${alt}` === row.key : label === row.key;
                  })
                  .filter((slot) => (draft.selections![slot.slotKey] ?? '').length > 0).length;
            return (
              <li key={row.key} className="structure__row">
                <span className="structure__group">
                  {row.label}
                  {row.alt && <em className="slots__alt">или {row.alt}</em>}
                </span>
                <span className="structure__side">
                  <span className="slots__count">{row.count} ×</span>
                  <span className={rowFilled === row.count ? 'structure__status structure__status--ok' : 'structure__status'}>
                    {rowFilled === 0 ? 'не выбрано' : rowFilled === row.count ? 'готово' : `${rowFilled} из ${row.count}`}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <aside className="note">
          Число слотов фиксировано — это структура тренировки. Заполни их
          вручную или сгенерируй подбор.
        </aside>

        <div className="screen__cta">
          <button className="btn btn--primary" onClick={onManual}>
            Выбрать упражнения
          </button>
          <button className="btn btn--ghost cta-row__second" onClick={onGenerate}>
            Сгенерировать тренировку
          </button>
          <button className="btn btn--ghost cta-row__second" onClick={onBackVolume}>
            Изменить объём
          </button>
        </div>
      </div>
    </div>
  );
}