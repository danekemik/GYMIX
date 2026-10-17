import { loadRecord } from '../../lib/record';
import { previousWorkingSets, workoutFromHistory } from '../../lib/reuseWorkout';
import { activeDraft, resumeDraft, sessionsForHistory } from '../../lib/session';
import { templatesFor, workoutFromTemplate } from '../../lib/templates';
import { bodyWeightSeries, progressSeries } from '../../lib/progress';
import { listExcluded } from '../../lib/exclusions';
import { weeklyActivity } from '../../lib/weeklyActivity';
import type { GymixDb } from '../../lib/db';

/** Named, read-only operations; SQL and its protocol stay in the database worker. */
export async function executeReadModel(db: GymixDb, key: string, params?: { names?: readonly string[] }) {
  const match = /^(record|template|repeat|resume):([0-9a-f-]{36})$/i.exec(key);
  if (match) {
    const id = match[2]!;
    const kind = match[1]!.toLowerCase();
    if (kind === 'record') return loadRecord(db, id);
    if (kind === 'template') return workoutFromTemplate(db, id);
    if (kind === 'repeat') return workoutFromHistory(db, id);
    return resumeDraft(db, id);
  }
  switch (key) {
    case 'previous': {
      if (!Array.isArray(params?.names) || params.names.some(name => typeof name !== 'string')) throw new Error('Не заданы упражнения');
      return previousWorkingSets(db, params.names);
    }
    case 'history': return sessionsForHistory(db);
    case 'active': return activeDraft(db);
    case 'templates': return templatesFor(db);
    case 'exclusions': return listExcluded(db);
    case 'week': return weeklyActivity(db);
    case 'progress:6m': case 'progress:all': {
      const since = key === 'progress:6m' ? new Date(Date.now() - 183 * 86_400_000) : undefined;
      const [series, body] = await Promise.all([progressSeries(db, since), bodyWeightSeries(db, since)]);
      return { series, body };
    }
    default: throw new Error('Неизвестный запрос локальных данных');
  }
}
