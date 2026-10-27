import { useLocalRead } from '../hooks/useLocalRead';
import { useEffect, useState } from 'react';
import { weekStart, type WeeklyActivity } from '../lib/weeklyActivity';
import { plural } from '../lib/draft';

interface WeekActivityProps {
  variant?: 'compact' | 'timeline';
  title?: string;
  /** На главной пустая неделя не нужна: там уже есть пустое состояние. */
  hideWhenEmpty?: boolean;
}

const dayLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

export function WeekActivity({ variant = 'compact', title = 'Эта неделя', hideWhenEmpty = false }: WeekActivityProps) {
  // A day change also refreshes the current week when the app stays open.
  const [date, setDate] = useState(() => new Date().toDateString());
  const { data: activity, error, reload } = useLocalRead<WeeklyActivity>('week', `week:${date}`);
  const failed = Boolean(error);
  useEffect(() => {
    const timer = window.setInterval(() => setDate(new Date().toDateString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const now = new Date();
  const today = (now.getDay() + 6) % 7;
  const start = weekStart(now);
  const timeline = variant === 'timeline';

  if (hideWhenEmpty && activity?.count === 0) return null;

  return <section className={`week${timeline ? ' week--timeline' : ''}`} aria-label="Активность на этой неделе">
    <div className="section-head"><h2 className="section-title">{title}</h2><span className="body-muted">{activity ? plural(activity.count, ['тренировка', 'тренировки', 'тренировок']) : failed ? 'Не удалось загрузить' : 'Загружаем…'}</span></div>
    <ol className="week__days">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + index);
      const mark = <span className="week__mark" aria-hidden="true">{activity?.days[index] ? (
        timeline ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 8 3 3 5-6" /></svg> : '✓'
      ) : !timeline && index === today ? '·' : ''}</span>;

      return <li key={day} className={`week__day${index === today ? ' week__day--today' : ''}${activity?.days[index] ? ' week__day--done' : ''}`} aria-current={index === today ? 'date' : undefined} aria-label={`${dayLabel.format(dayDate)}: ${activity ? plural(activity.days[index]!, ['тренировка', 'тренировки', 'тренировок']) : failed ? 'нет данных' : 'загрузка'}${index === today ? ', сегодня' : ''}`}>
        {timeline ? <>{mark}<span className="week__label"><span>{day}</span><span className="week__date">{dayDate.getDate()}</span></span></> : <><span>{day}</span>{mark}</>}
      </li>;
    })}</ol>
    {activity?.count === 0 && <p className="week__hint">Каждая завершённая тренировка появится здесь.</p>}
    {timeline && failed && !activity && <button className="text-action week__retry" onClick={() => void reload()}>Повторить загрузку недели</button>}
  </section>;
}
