import { useLocalRead } from '../hooks/useLocalRead';
import { SettingsButton } from '../components/SettingsButton';
import { WeekActivity } from '../components/WeekActivity';
import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { LineChart } from '../components/LineChart';
import { Segmented } from '../components/Segmented';
import { plural } from '../lib/draft';
import { formatDate } from '../lib/format';
import {
  saveBodyWeight,
  type BodyWeightPoint,
  type ExerciseSeries,
} from '../lib/progress';


export function ProgressScreen({ onSettings }: { onSettings: () => void }) {
  const { db } = useDb();
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState<'6m' | 'all'>('6m');
  const [metric, setMetric] = useState<'weight' | 'reps'>('weight');
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [weightError, setWeightError] = useState('');

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
    if (raw === '' || !/^\d+(\.\d{1,2})?$/.test(raw)) {
      setWeightError('Введи вес числом, например 72,5');
      return;
    }
    setWeightError('');
    setSaving(true);
    try {
      await saveBodyWeight(db, new Date().toISOString().slice(0, 10), Number(raw));
      setWeightInput('');
      await reload();
    } finally {
      setSaving(false);
    }
  };

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
          options={[
            { value: '6m', label: '6 месяцев' },
            { value: 'all', label: 'Вся история' },
          ]}
        />

        {error !== undefined && (
          <p className="body-error" role="alert">
            Не удалось загрузить прогресс: {error}
          </p>
        )}

        {error === undefined && series === undefined && <p className="body-muted">Загружаем прогресс…</p>}

        {series !== undefined && (
          <section className="progress-card">
            <div className="progress-card__head">
              <h2 className="progress-card__title">Упражнения</h2>
              <Segmented
                value={metric}
                onChange={(v) => setMetric(v as 'weight' | 'reps')}
                options={[
                  { value: 'weight', label: 'Вес' },
                  { value: 'reps', label: 'Повторы' },
                ]}
              />
            </div>

            {series.length === 0 && (
              <p className="body-muted">
                Здесь появится график лучшего подхода по каждому упражнению после
                нескольких тренировок.
              </p>
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
                    <div className="chart__axis" aria-hidden="true">
                      <span>{first!.label}</span>
                      <span>
                        {formatValue(Math.max(...formatted.map((p) => p.value)))} ·{' '}
                        {formatValue(Math.min(...formatted.map((p) => p.value)))}
                      </span>
                      <span>{last!.label}</span>
                    </div>

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
              <div className="chart__axis" aria-hidden="true">
                <span>{formatDate(new Date(`${body[0]!.date}T00:00:00`))}</span>
                <span>{formatDate(new Date(`${body[body.length - 1]!.date}T00:00:00`))}</span>
              </div>
            </>
          )}

          <div className="progress-card__record">
            <input
              className="field__input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={weightInput}
              onChange={(e) => { setWeightInput(e.target.value); if (weightError) setWeightError(''); }}
              placeholder={`Вес сегодня, кг (${formatDate(new Date())})`}
              aria-label="Записать вес тела на сегодня"
              aria-invalid={weightError !== '' || undefined}
              aria-describedby={weightError ? 'weight-error' : undefined}
            />
            <button className="btn btn--primary btn--sm" disabled={saving} onClick={() => void recordWeight()}>
              Записать
            </button>
          </div>
          {weightError && <p className="body-error" id="weight-error" role="alert">{weightError}</p>}
        </section>
      </div>
    </div>
  );
}