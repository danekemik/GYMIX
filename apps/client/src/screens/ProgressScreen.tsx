import { useLocalRead } from '../hooks/useLocalRead';
import { SettingsButton } from '../components/SettingsButton';
import { WeekActivity } from '../components/WeekActivity';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { LineChart } from '../components/LineChart';
import { Segmented } from '../components/Segmented';
import { plural } from '../lib/draft';
import { formatDate, localDateKey } from '../lib/format';
import {
  saveBodyWeight,
  type BodyWeightPoint,
  type ExerciseSeries,
} from '../lib/progress';


export function ProgressScreen({ onSettings, onCreate }: { onSettings: () => void; onCreate: () => void }) {
  const { db } = useDb();
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState<'6m' | 'all'>('6m');
  const [metric, setMetric] = useState<'weight' | 'reps'>('weight');
  const [weightInput, setWeightInput] = useState('');
  const weightRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [weightError, setWeightError] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);

  useEffect(() => {
    if (!weightSaved) return;
    const timer = window.setTimeout(() => setWeightSaved(false), 4000);
    return () => window.clearTimeout(timer);
  }, [weightSaved]);

  const { data, error: readError, reload } = useLocalRead<{ series: ExerciseSeries[]; body: BodyWeightPoint[]; }>(`progress:${period}`, `progress:${period}:${new Date().toDateString()}`);
  const series = data?.series;
  const body = data?.body;
  const error = readError?.message;

  useEffect(() => {
    setSelected((prev) => series?.some(item => item.name === prev) ? prev : series?.[0]?.name);
  }, [series]);

  const active: ExerciseSeries | undefined = useMemo(
    () => series?.find((s) => s.name === selected),
    [series, selected],
  );

  const formatted = useMemo(() => {
    if (active === undefined) return [];
    return active.points.map((p) => ({
      label: formatDate(p.date),
      value: metric === 'weight' ? p.weight : p.reps,
      meta: metric === 'weight' ? `${p.reps} повторов` : `${p.weight} кг`,
    }));
  }, [active, metric]);

  const formatValue = (n: number) => (metric === 'weight' ? `${n} кг` : `${n} повт.`);

  const [first, last] = [formatted[0], formatted[formatted.length - 1]];
  const summaryId = 'weight-summary';

  const recordWeight = async () => {
    if (db === undefined) return;
    const raw = weightInput.trim().replace(',', '.');
    const value = Number(raw);
    if (raw === '' || !/^\d+(\.\d{1,2})?$/.test(raw) || value <= 0 || value > 500) {
      setWeightError('Введи вес от 1 до 500 кг, например 72,5');
      weightRef.current?.focus();
      return;
    }
    setWeightError('');
    setWeightSaved(false);
    setSaving(true);
    try {
      await saveBodyWeight(db, localDateKey(), value);
      setWeightInput('');
      setWeightSaved(true);
      await reload();
    } catch {
      setWeightError('Не удалось записать вес. Попробуй ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  const latestBody = body?.at(-1);
  const previousBody = body !== undefined && body.length > 1 ? body[body.length - 2] : undefined;
  const bodyDelta = latestBody !== undefined && previousBody !== undefined
    ? Math.round((latestBody.value - previousBody.value) * 10) / 10
    : undefined;

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title">Прогресс</h1><SettingsButton onClick={onSettings} />
      </header>

      <div className="screen__body">
        <WeekActivity />
        <Segmented
          value={period}
          onChange={(v) => setPeriod(v as '6m' | 'all')}
          label="Период"
          options={[
            { value: '6m', label: '6 месяцев' },
            { value: 'all', label: 'Вся история' },
          ]}
        />

        {error !== undefined && (
          <div className="note note--error" role="alert">
            Не удалось загрузить прогресс. <button className="text-action" onClick={() => void reload()}>Повторить</button>
          </div>
        )}

        {error === undefined && series === undefined && <p className="body-muted">Загружаем прогресс…</p>}

        {series !== undefined && (
          <section className="progress-card">
            <div className="progress-card__head">
              <h2 className="progress-card__title">Упражнения</h2>
              {series.length > 0 && (
                <Segmented
                  value={metric}
                  onChange={(v) => setMetric(v as 'weight' | 'reps')}
                  label="Что показывать на графике"
                  options={[
                    { value: 'weight', label: 'Вес' },
                    { value: 'reps', label: 'Повторы' },
                  ]}
                />
              )}
            </div>

            {series.length === 0 && (
              <div className="empty empty--compact">
                <h3 className="empty__title">Пока нечего сравнивать</h3>
                <p className="empty__text">
                  Заверши пару тренировок — покажем лучший подход по каждому упражнению.
                </p>
                <button className="btn btn--primary btn--sm" onClick={onCreate}>
                  Собрать тренировку
                </button>
              </div>
            )}

            {series.length > 0 && (
              <>
                <label className="field progress-card__select">
                  <span className="field__label">Упражнение</span>
                  <select
                    className="field__input"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {series.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                {active === undefined || active.points.length === 0 ? (
                  <p className="body-muted">Нет выполненных подходов за этот период.</p>
                ) : (
                  <>
                    <p className="progress-card__summary" id={summaryId}>
                      Последняя тренировка: {formatValue(last!.value)} · {last!.meta} ({last!.label}). {' '}
                      {plural(active.points.length, ['тренировка', 'тренировки', 'тренировок'])} за период.
                    </p>
                    {active.points.length > 1 && <div className="progress-comparison">
                      <div><span>В начале периода</span><strong>{active.points[0]!.weight} кг × {active.points[0]!.reps}</strong></div>
                      <div><span>Последний раз</span><strong>{active.points.at(-1)!.weight} кг × {active.points.at(-1)!.reps}</strong></div>
                      <p>Сравнивай вес вместе с числом повторений. Каждый пункт — лучший подход отдельной тренировки.</p>
                    </div>}
                    <LineChart
                      points={formatted}
                      formatValue={formatValue}
                      ariaLabel={`Динамика упражнения «${active.name}» по ${metric === 'weight' ? 'весу' : 'повторениям'}`}
                      describedBy={summaryId}
                    />
                    {formatted.length === 1 && (
                      <p className="progress-card__hint">
                        Пока одна тренировка за период — линия появится после следующей.
                      </p>
                    )}
                    {formatted.length > 1 && (
                      <div className="chart__axis" aria-hidden="true">
                        <span>{first!.label}</span>
                        <span>
                          {formatValue(Math.max(...formatted.map((p) => p.value)))} ·{' '}
                          {formatValue(Math.min(...formatted.map((p) => p.value)))}
                        </span>
                        <span>{last!.label}</span>
                      </div>
                    )}

                    <table className="chart-table">
                      <caption className="chart-table__caption">
                        Лучший подход каждой тренировки: {active.name} ({metric === 'weight' ? 'вес' : 'повторения'})
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Дата</th>
                          {metric === 'weight' && <th scope="col">Вес</th>}
                          <th scope="col">Повторения</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.points.map((p) => (
                          <tr key={p.date.toISOString()}>
                            <th scope="row">{formatDate(p.date)}</th>
                            {metric === 'weight' && <td>{p.weight} кг</td>}
                            <td>{p.reps}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </section>
        )}

        <section className="progress-card">
          <div className="progress-card__head">
            <h2 className="progress-card__title">Вес тела</h2>
            {latestBody !== undefined && (
              <p className="progress-card__latest">
                <strong>{latestBody.value.toLocaleString('ru-RU')} кг</strong>
                <span>{formatDate(new Date(`${latestBody.date}T00:00:00`))}</span>
                {bodyDelta !== undefined && bodyDelta !== 0 && (
                  <span className={bodyDelta > 0 ? 'progress-card__delta' : 'progress-card__delta progress-card__delta--down'}>
                    {bodyDelta > 0 ? '+' : '−'}{Math.abs(bodyDelta).toLocaleString('ru-RU')} кг
                  </span>
                )}
              </p>
            )}
          </div>
          {body === undefined ? (
            <p className="body-muted">Загружаем…</p>
          ) : body.length === 0 ? (
            <p className="body-muted">Записывай вес, чтобы видеть динамику.</p>
          ) : (
            <>
              <LineChart
                points={body.map((b) => ({ label: formatDate(new Date(`${b.date}T00:00:00`)), value: b.value }))}
                formatValue={(n) => `${n} кг`}
                ariaLabel="Динамика веса тела"
              />
              {body.length === 1 && (
                <p className="progress-card__hint">
                  Пока одно взвешивание — линия появится после следующего.
                </p>
              )}
              {body.length > 1 && (
                <div className="chart__axis" aria-hidden="true">
                  <span>{formatDate(new Date(`${body[0]!.date}T00:00:00`))}</span>
                  <span>{formatDate(new Date(`${body[body.length - 1]!.date}T00:00:00`))}</span>
                </div>
              )}
            </>
          )}

          <div className="progress-card__record">
            <input
              ref={weightRef}
              className="field__input"
              type="number"
              inputMode="decimal"
              min="1"
              max="500"
              step="0.1"
              value={weightInput}
              onChange={(e) => { setWeightInput(e.target.value); if (weightError) setWeightError(''); }}
              placeholder="Например, 72,5"
              aria-label="Вес тела на сегодня, кг"
              aria-invalid={weightError !== '' || undefined}
              aria-describedby={weightError ? 'weight-error' : 'weight-hint'}
            />
            <button className="btn btn--primary btn--sm" disabled={saving || weightInput.trim() === ''} onClick={() => void recordWeight()}>
              {saving ? 'Сохраняем…' : 'Записать'}
            </button>
          </div>
          {weightError !== '' ? (
            <p className="body-error" id="weight-error" role="alert">{weightError}</p>
          ) : (
            <p className="progress-card__hint" id="weight-hint">
              Запись за сегодня, {formatDate(new Date())}. Вес от 1 до 500 кг.
            </p>
          )}
          {weightSaved && <p className="body-muted" role="status">Вес записан.</p>}
        </section>
      </div>
    </div>
  );
}