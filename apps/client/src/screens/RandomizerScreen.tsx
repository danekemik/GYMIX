import { queryExcludedNames } from '../data/local/read-rpc';
import { useEffect, useState } from 'react';
import { InsufficientCatalogError, generateWorkout, type GeneratedWorkout, type InsufficientSlot } from '@gymix/generator';
import type { Draft } from '../lib/draft';
import { getCatalog } from '../lib/catalog';
import { useDb } from '../hooks/useDb';

interface RandomizerScreenProps {
  draft: Draft;
  seed: number;
  onContinue: (workout: GeneratedWorkout) => void;
  onRegenerate: () => void;
  onBack: () => void;
}
const REASON_LABELS: Record<InsufficientSlot['reason'], string> = {
  'пусто': 'нет упражнений этой группы',
  'все исключены': 'все упражнения группы исключены',
  'только повторы': 'остались только уже выбранные упражнения',
  'выбор вне слота': 'выбранное упражнение не подходит этому слоту',
};

/** Loading is real work only; a successful result opens the preview directly. */
export function RandomizerScreen({ draft, seed, onContinue, onRegenerate, onBack }: RandomizerScreenProps) {
  const { db, error: dbError } = useDb();
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState<readonly InsufficientSlot[]>([]);
  useEffect(() => {
    setFailed(false); setMissing([]);
    if (!db) { if (dbError) setFailed(true); return; }
    let alive = true;
    void queryExcludedNames(db).then(names => {
      if (!alive) return;
      const result = generateWorkout(getCatalog(), {
        type: draft.type, volume: draft.volume,
        ...(draft.mgsGroup ? { targetGroup: draft.mgsGroup } : {}),
        // Exclusion affects future choices, not exercises already kept in this composition.
        excludedExerciseNames: names.filter(name => !Object.values(draft.selections ?? {}).includes(name)),
        ...(draft.selections ? { lockedSelections: draft.selections } : {}),
        seed,
      });
      onContinue(result);
    }).catch(error => {
      if (!alive) return;
      if (error instanceof InsufficientCatalogError) setMissing(error.missing);
      setFailed(true);
    });
    return () => { alive = false; };
    // onContinue is a navigation callback; changing its identity is not a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, dbError, draft.type, draft.volume, draft.mgsGroup, draft.selections, seed]);
  return <div className="screen">
    <header className="topbar">
      <button className="topbar__back" onClick={onBack} aria-label="Назад">←</button>
      <h1 className="topbar__title topbar__title--step">Подбор упражнений</h1>
    </header>
    <div className="screen__body">
      {failed ? <div className="note note--error" role="alert">
        <p className="note__title">Не удалось собрать тренировку</p>
        {missing.length > 0 ? <><p>Измени выбор или верни исключённые упражнения:</p>
          <ul className="note__list">{missing.map(slot => <li key={slot.slotKey}>{slot.allowed.join(' / ')} — {REASON_LABELS[slot.reason]}</li>)}</ul></>
          : <p>Локальные данные недоступны. Попробуй ещё раз.</p>}
        <button className="btn btn--primary" onClick={onBack}>Вернуться к выбору</button>
        {missing.length === 0 && <button className="btn btn--ghost" onClick={onRegenerate}>Повторить</button>}
      </div> : <p className="body-muted" role="status">Подбираем упражнения…</p>}
    </div>
  </div>;
}
