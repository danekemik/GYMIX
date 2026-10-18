import { typeLabel } from '../lib/workoutTypes';
import { repsValue, weightValue } from '../domain/setInput';
import { useLocalRead } from '../hooks/useLocalRead';
import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { formatDate, formatDurationMs } from '../lib/format';
import { saveRecord, type RecordExercise, type RecordSnapshot } from '../lib/record';

interface RecordScreenProps {
  sessionId: string;
  onBack: () => void;
}

interface EditSet {
  id: string;
  weight: string;
  reps: string;
}

interface EditExercise {
  id: string;
  name: string;
  status: 'completed' | 'skipped' | 'pending';
  sets: EditSet[];
}

function toEditable(snapshot: RecordSnapshot): EditExercise[] {
  return snapshot.exercises.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    sets: e.sets.map((s) => ({
      id: s.id,
      weight: s.weight ?? '',
      reps: s.reps === null ? '' : String(s.reps),
    })),
  }));
}

export function RecordScreen({ sessionId, onBack }: RecordScreenProps) {
  const { db } = useDb();
  const { data: loaded, error: readError, reload } = useLocalRead<RecordSnapshot>(`record:${sessionId}`);
  const [record, setRecord] = useState<RecordSnapshot | undefined>(loaded);
  const error = readError?.message;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditExercise[]>([]);
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Keep the revision from which an edit started. Background refresh must not
  // make an old form silently overwrite changes from another device.
  useEffect(() => { if (!editing) setRecord(loaded); }, [loaded, editing]);

  const done = useMemo(
    () => record?.exercises.filter((e) => e.status === 'completed').length ?? 0,
    [record],
  );
  const total = record?.exercises.length ?? 0;

  const startEdit = () => {
    if (record === undefined) return;
    setDraft(toEditable(record));
    setDate(localDateInput(record.startedAt));
    setSaveError(undefined);
    setEditing(true);
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (draft[target] === undefined) return;
    setDraft((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  };

  const setStatus = (id: string, status: 'completed' | 'skipped') =>
    setDraft((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));

  const setSet = (exerciseId: string, setId: string, field: 'weight' | 'reps', value: string) =>
    setDraft((prev) =>
      prev.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)) }
          : e,
      ),
    );

  const save = async () => {
    if (db === undefined || record === undefined) return;
    const day = new Date(`${date}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || localDateInput(day) !== date) { setSaveError('Выбери корректную дату.'); return; }
    const invalid = draft.find(exercise => exercise.sets.some(set =>
      (set.weight.trim() !== '' && weightValue(set.weight) === null) ||
      (set.reps.trim() !== '' && repsValue(set.reps) === null) ||
      (exercise.status === 'completed' && repsValue(set.reps) === null)
    ));
    if (invalid) { setSaveError(`Проверь вес и повторения: «${invalid.name}».`); return; }
    const started = new Date(record.startedAt);
    const completed = new Date(record.completedAt);
    const delta = day.getTime() - new Date(localDateInput(record.startedAt) + 'T00:00:00').getTime();
    started.setTime(started.getTime() + delta);
    completed.setTime(completed.getTime() + delta);

    setSaving(true);
    setSaveError(undefined);
    try {
      await saveRecord(db, sessionId, {
        baseRevision: record.revision,
        startedAt: started,
        completedAt: completed,
        exercises: draft.map((e) => ({
          id: e.id,
          status: e.status,
          sets: e.sets.map((s) => ({ id: s.id, weight: s.weight.trim(), reps: s.reps.trim() === '' ? null : Number(s.reps) })),
        })),
      });
      await reload();
      setEditing(false);
    } catch (e: unknown) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen screen--record">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Тренировка</h1>
      </header>

      <div className="screen__body">
        {error !== undefined && (
          <p className="body-error" role="alert">
            Не удалось загрузить запись: {error}
          </p>
        )}

        {error === undefined && record === undefined && <p className="body-muted">Загружаем запись…</p>}

        {record !== undefined && (
          <>
            <aside className="note record-context">
              <span className="context__type">{typeLabel(record.type)}</span>
              <span className="volume-head__meta">
                {record.volume} · {done}/{total} · {formatDurationMs(record.durationMs)} ·{' '}
                {formatDate(record.completedAt)}
              </span>
            </aside>

            {saveError !== undefined && (
              <p className="body-error" role="alert">
                Не удалось сохранить: {saveError}
              </p>
            )}

            {!editing && (
              <ul className="record-exercises">
                {record.exercises.map((ex, index) => {
                  const head = <><span className="record-exercise__index">{index + 1}</span><span className="record-exercise__name">{ex.name}</span><span className={`record-exercise__status record-exercise__status--${ex.status}`}>{ex.status === 'completed' ? 'Выполнено' : ex.partial ? 'Не завершено' : 'Пропущено'}</span></>;
                  return <li key={ex.id} className="record-exercise">
                    {ex.status === 'completed' ? <><div className="record-exercise__head">{head}</div><RecordedSets exercise={ex} /></> : <details className="record-exercise__details">
                      <summary className="record-exercise__head">{head}<span aria-hidden="true">⌄</span></summary>
                      <RecordedSets exercise={ex} />
                    </details>}
                  </li>;
                })}
              </ul>
            )}

            {editing && (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="record-date">
                    Дата
                  </label>
                  <input
                    id="record-date"
                    className="field__input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <ul className="record-exercises">
                  {draft.map((ex, index) => (
                    <li key={ex.id} className={`record-exercise ${ex.status === 'skipped' ? 'record-exercise--skipped' : ''}`}>
                      <div className="record-exercise__head">
                        <span className="record-exercise__index">{index + 1}</span>
                        <span className="record-exercise__name">{ex.name}</span>
                        <button
                          className="btn btn--ghost btn--sm"
                          aria-pressed={ex.status === 'completed'}
                          onClick={() => setStatus(ex.id, ex.status === 'completed' ? 'skipped' : 'completed')}
                        >
                          {ex.status === 'completed' ? 'Выполнено' : ex.status === 'pending' ? 'Не завершено' : 'Пропущено'}
                        </button>
                      </div>
                      <div className="record-exercise__tools">
                        <button className="btn btn--ghost btn--sm" disabled={index === 0} onClick={() => move(index, -1)}>
                          Выше
                        </button>
                        <button
                          className="btn btn--ghost btn--sm"
                          disabled={index === draft.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          Ниже
                        </button>
                      </div>
                      {ex.sets.map((s) => (
                        <div className="record-edit-set" key={s.id}>
                          <span className="record-edit-set__n">Подход {ex.sets.indexOf(s) + 1}</span>
                          <input
                            className="field__input record-edit-set__input"
                            type="text"
                            inputMode="decimal"
                            placeholder="Вес"
                            aria-label={`Вес, подход ${ex.sets.indexOf(s) + 1}`}
                            value={s.weight}
                            onChange={(e) => setSet(ex.id, s.id, 'weight', e.target.value)}
                          />
                          <input
                            className="field__input record-edit-set__input"
                            type="text"
                            inputMode="numeric"
                            placeholder="Повторы"
                            aria-label={`Повторения, подход ${ex.sets.indexOf(s) + 1}`}
                            value={s.reps}
                            onChange={(e) => setSet(ex.id, s.id, 'reps', e.target.value)}
                          />
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="screen__cta">
              {!editing ? (
                <button className="btn btn--primary" onClick={startEdit}>
                  Редактировать запись
                </button>
              ) : (
                <>
                  <button className="btn btn--primary" disabled={saving} onClick={() => void save()}>
                    Сохранить
                  </button>
                  <button className="btn btn--ghost" disabled={saving} onClick={() => setEditing(false)}>
                    Отмена
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function localDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function RecordedSets({ exercise }: { exercise: RecordExercise }) {
  const sets = exercise.status === 'completed' ? exercise.sets : exercise.sets.filter(set => set.done);
  if (!sets.length) return <p className="body-muted record-exercise__empty">Нет отмеченных подходов.</p>;
  return <table className="record-sets">{sets.some(set => set.weight === null) && <caption className="record-sets__caption">«—» — без дополнительного веса.</caption>}<thead><tr><th scope="col">Подход</th><th scope="col">Вес, кг</th><th scope="col">Повторы</th></tr></thead><tbody>
    {sets.map(set => <tr key={set.id}><th scope="row">{set.setNumber}</th><td>{set.weight ?? '—'}</td><td>{set.reps ?? '—'}</td></tr>)}
  </tbody></table>;
}
