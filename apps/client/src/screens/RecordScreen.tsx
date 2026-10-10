import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { formatDate, formatDurationMs } from '../lib/format';
import { loadRecord, saveRecord, type RecordExercise, type RecordSnapshot } from '../lib/record';

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
  status: 'completed' | 'skipped';
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
  const [record, setRecord] = useState<RecordSnapshot | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditExercise[]>([]);
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const reload = async () => {
    if (db === undefined) return;
    try {
      setRecord(await loadRecord(db, sessionId));
      setError(undefined);
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, sessionId]);

  const done = useMemo(
    () => record?.exercises.filter((e) => e.status === 'completed').length ?? 0,
    [record],
  );
  const total = record?.exercises.length ?? 0;

  const startEdit = () => {
    if (record === undefined) return;
    setDraft(toEditable(record));
    setDate(record.startedAt.toISOString().slice(0, 10));
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
    const started = new Date(record.startedAt);
    const completed = new Date(record.completedAt);
    const delta = day.getTime() - new Date(record.startedAt.toISOString().slice(0, 10) + 'T00:00:00').getTime();
    started.setTime(started.getTime() + delta);
    completed.setTime(completed.getTime() + delta);

    setSaving(true);
    setSaveError(undefined);
    try {
      await saveRecord(db, sessionId, {
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

        {error === undefined && record !== undefined && (
          <>
            <aside className="note">
              <span className="context__type">{record.type}</span>
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
                {record.exercises.map((ex, index) => (
                  <li key={ex.id} className="record-exercise">
                    <div className="record-exercise__head">
                      <span className="record-exercise__index">{index + 1}</span>
                      <span className="record-exercise__name">{ex.name}</span>
                      <span className={`record-exercise__status record-exercise__status--${ex.status}`}>
                        {ex.status === 'completed' ? 'Выполнено' : 'Пропущено'}
                      </span>
                    </div>
                    {ex.sets.length > 0 && (
                      <table className="record-sets">
                        <thead>
                          <tr>
                            <th scope="col">Подход</th>
                            <th scope="col">Вес</th>
                            <th scope="col">Повторения</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ex.sets.map((s) => (
                            <tr key={s.id}>
                              <th scope="row">{s.setNumber}</th>
                              <td>{s.weight ?? '—'}</td>
                              <td>{s.reps ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </li>
                ))}
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
                          {ex.status === 'completed' ? 'Выполнено' : 'Пропущено'}
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
                  <button className="btn btn--ghost cta-row__second" disabled={saving} onClick={() => setEditing(false)}>
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