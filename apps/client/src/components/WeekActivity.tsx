import { useEffect, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { weeklyActivity, type WeeklyActivity } from '../lib/weeklyActivity';
import { plural } from '../lib/draft';

export function WeekActivity() {
  const { db, revision } = useDb();
  const [activity, setActivity] = useState<WeeklyActivity>();
  const [failed, setFailed] = useState(false);
  // A day change also refreshes the current week when the app stays open.
  const [date, setDate] = useState(() => new Date().toDateString());
  useEffect(() => {
    const timer = window.setInterval(() => setDate(new Date().toDateString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!db) return;
    let alive = true;
    weeklyActivity(db).then(value => { if (alive) { setActivity(value); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [db, revision, date]);
  const today = (new Date().getDay() + 6) % 7;
  return <section className="week" aria-label="Активность на этой неделе">
    <div className="section-head"><h2 className="section-title">Эта неделя</h2><span className="body-muted">{activity ? plural(activity.count, ['тренировка', 'тренировки', 'тренировок']) : failed ? 'Не удалось загрузить' : 'Загружаем…'}</span></div>
    <ol className="week__days">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => <li key={day} className={`week__day${index === today ? ' week__day--today' : ''}${activity?.days[index] ? ' week__day--done' : ''}`} aria-label={`${day}: ${activity ? plural(activity.days[index]!, ['тренировка', 'тренировки', 'тренировок']) : 'загрузка'}${index === today ? ', сегодня' : ''}`}>
      <span>{day}</span><span className="week__mark" aria-hidden="true">{activity?.days[index] ? '✓' : index === today ? '·' : '—'}</span>
    </li>)}</ol>
    {activity?.count === 0 && <p className="week__hint">Каждая завершённая тренировка появится здесь.</p>}
  </section>;
}
