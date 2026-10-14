import { useId } from 'react';
import { plural, rosterRows, structureFor, type Draft } from '../lib/draft';

interface StructureScreenProps {
  draft: Draft;
  onBack: () => void;
  onManual: () => void;
  onGenerate: () => void;
  onOpenSlot: (slotKey: string) => void;
}

export function StructureScreen({ draft, onBack, onManual, onGenerate, onOpenSlot }: StructureScreenProps) {
  const progressLabelId = useId();
  const structure = structureFor(draft);
  const rows = rosterRows(structure.slots);
  const total = structure.exerciseCount;
  const selections = draft.selections ?? {};
  const filled = Object.values(selections).filter((name) => name.length > 0).length;

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
          <span className="progress__label" id={progressLabelId}>
            Заполнено {filled} из {plural(total, ['слота', 'слотов', 'слотов'])}
          </span>
          <span
            className="progress__track"
            role="progressbar"
            aria-labelledby={progressLabelId}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={filled}
          >
            <span className="progress__bar" style={{ width: `${(filled / total) * 100}%` }} />
          </span>
        </div>

        <ol className="structure">
          {rows.map((row) => {
            const rowFilled = row.slots.filter((slot) => (selections[slot.slotKey] ?? '').length > 0).length;
            const done = rowFilled === row.count;
            return (
              <li key={row.key} className="structure__row">
                <div className="structure__head">
                  <span className="structure__group">
                    {row.label}
                    {row.alt && <em className="slots__alt">или {row.alt}</em>}
                  </span>
                  <span className="structure__side">
                    <span className="slots__count">{row.count} ×</span>
                    {rowFilled > 0 && (
                      <span className={done ? 'structure__status structure__status--ok' : 'structure__status'}>
                        {done ? 'готово' : `${rowFilled} из ${row.count}`}
                      </span>
                    )}
                  </span>
                </div>

                <ul className="structure__slots">
                  {row.slots.map((slot, index) => {
                    const chosen = selections[slot.slotKey] ?? '';
                    return (
                      <li key={slot.slotKey}>
                        <button
                          type="button"
                          className={chosen ? 'slot-row slot-row--done' : 'slot-row'}
                          onClick={() => onOpenSlot(slot.slotKey)}
                        >
                          {row.count > 1 && <span className="slot-row__index">{index + 1}</span>}
                          <span className="slot-row__value">{chosen || 'Выбрать упражнение'}</span>
                          <svg className="slot-row__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>

        <div className="screen__cta screen__cta--sticky">
          <button className="btn btn--primary" onClick={onManual}>
            Выбрать упражнения
          </button>
          <button className="btn btn--ghost" onClick={onGenerate}>
            Сгенерировать тренировку
          </button>
        </div>
      </div>
    </div>
  );
}
