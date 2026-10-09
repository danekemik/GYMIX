export function formatDurationMs(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin} мин`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Сегодня/вчера/дата — для ленты «Истории» и карточки активности. */
export function formatDay(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (days <= 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  return formatDate(date);
}