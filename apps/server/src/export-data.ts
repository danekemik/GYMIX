import { asc, eq, inArray } from 'drizzle-orm';
import {
  bodyWeightEntries,
  devices,
  exercises,
  sessionExercises,
  sessionIntervals,
  sessionSets,
  userExcludedExercises,
  users,
  workoutSessions,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import type { AppContext } from './app.js';

/**
 * Экспорт аккаунта в JSON (функция переносимости данных). Никаких секретов:
 * пароли, refresh-хэши, коды и журнал синхронизации в выгрузку не входят.
 */

export interface ExportData {
  app: string;
  exportVersion: number;
  exportedAt: string;
  user: {
    email: string;
    emailVerifiedAt: string | null;
    createdAt: string;
  };
  devices: Array<{ id: string; label: string; lastSeenAt: string; createdAt: string }>;
  templates: Array<{
    id: string;
    title: string;
    type: string;
    volume: string;
    createdAt: string;
    entries: Array<{
      exerciseName: string;
      slotKey: string;
      position: number;
      defaultSets: number;
    }>;
  }>;
  exclusions: string[];
  bodyWeight: Array<{ measuredAt: string; value: string; unit: string }>;
  sessions: Array<{
    id: string;
    type: string;
    volume: string;
    status: 'active' | 'completed';
    startedAt: string;
    completedAt: string | null;
    exercises: Array<{
      name: string;
      status: 'pending' | 'active' | 'completed' | 'skipped';
      position: number;
      sets: Array<{ setNumber: number; weight: string | null; reps: number | null }>;
    }>;
    intervals: Array<{ startedAt: string; endedAt: string | null }>;
  }>;
}

export async function buildExport(ctx: AppContext, userId: string): Promise<ExportData> {
  const db = ctx.db;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error('Пользователь не найден');

  const deviceRows = await db
    .select()
    .from(devices)
    .where(eq(devices.userId, userId))
    .orderBy(asc(devices.createdAt));

  const templates = await templateViews(ctx, userId);

  const exclusionRows = await db
    .select({ name: exercises.canonicalNameRu })
    .from(userExcludedExercises)
    .innerJoin(exercises, eq(exercises.id, userExcludedExercises.exerciseId))
    .where(eq(userExcludedExercises.userId, userId));
  const exclusions = exclusionRows.map((r) => r.name).sort((a, b) => a.localeCompare(b));

  const weightRows = await db
    .select()
    .from(bodyWeightEntries)
    .where(eq(bodyWeightEntries.userId, userId))
    .orderBy(asc(bodyWeightEntries.measuredAt));

  const sessions = await collectSessions(ctx, userId);

  return {
    app: 'gymix',
    exportVersion: 1,
    exportedAt: ctx.clock().toISOString(),
    user: {
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    },
    devices: deviceRows.map((d) => ({
      id: d.id,
      label: d.label,
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    })),
    templates,
    exclusions,
    bodyWeight: weightRows.map((row) => ({
      measuredAt: row.measuredAt,
      value: String(row.value),
      unit: row.unit,
    })),
    sessions,
  };
}

async function templateViews(
  ctx: AppContext,
  userId: string,
): Promise<ExportData['templates']> {
  const { listTemplates } = await import('./routes/templates.js');
  const views = await listTemplates(ctx, userId);
  return views.map((view) => ({
    id: view.id,
    title: view.title,
    type: view.type,
    volume: view.volume,
    createdAt: view.createdAt,
    entries: view.entries.map((entry) => ({
      exerciseName: entry.exerciseName,
      slotKey: entry.slotKey,
      position: entry.position,
      defaultSets: entry.defaultSets,
    })),
  }));
}

async function collectSessions(
  ctx: AppContext,
  userId: string,
): Promise<ExportData['sessions']> {
  const db = ctx.db;
  const sessionRows = await db
    .select({
      id: workoutSessions.id,
      typeId: workoutSessions.typeId,
      volumeId: workoutSessions.volumeId,
      status: workoutSessions.status,
      startedAt: workoutSessions.startedAt,
      completedAt: workoutSessions.completedAt,
    })
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, userId))
    .orderBy(asc(workoutSessions.startedAt));

  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((s) => s.id);
  const exercisesOfSessions = await db
    .select()
    .from(sessionExercises)
    .where(inArray(sessionExercises.sessionId, sessionIds));
  const intervals = await db
    .select()
    .from(sessionIntervals)
    .where(inArray(sessionIntervals.sessionId, sessionIds));

  const exIds = exercisesOfSessions.map((e) => e.id);
  const sets = exIds.length
    ? await db.select().from(sessionSets).where(inArray(sessionSets.sessionExerciseId, exIds))
    : [];
  const setsByExercise = groupSets(sets);

  const typeById = new Map((await db.select().from(workoutTypes)).map((t) => [t.id, t.key]));
  const volumeById = new Map((await db.select().from(workoutVolumes)).map((v) => [v.id, v.key]));

  return sessionRows.map((session) => ({
    id: session.id,
    type: typeById.get(session.typeId) ?? session.typeId,
    volume: volumeById.get(session.volumeId) ?? session.volumeId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    exercises: exercisesOfSessions
      .filter((e) => e.sessionId === session.id)
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        name: e.exerciseNameSnapshot,
        status: e.status,
        position: e.position,
        sets: (setsByExercise.get(e.id) ?? []).map((s) => ({
          setNumber: s.setNumber,
          weight: s.weight === null ? null : String(s.weight),
          reps: s.reps,
        })),
      })),
    intervals: intervals
      .filter((i) => i.sessionId === session.id)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((i) => ({
        startedAt: i.startedAt.toISOString(),
        endedAt: i.endedAt ? i.endedAt.toISOString() : null,
      })),
  }));
}

function groupSets<T extends { sessionExerciseId: string }>(rows: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.sessionExerciseId;
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
}