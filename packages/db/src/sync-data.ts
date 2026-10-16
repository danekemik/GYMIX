import { and, eq, inArray } from 'drizzle-orm';
import type { SyncEntity, WorkoutEntity } from '@gymix/contracts';
import type { Db } from './seed-data.js';
import { bodyWeightEntries, devices, exercises, sessionExercises, sessionIntervals, sessionSets, templateExercises, userExcludedExercises, workoutSessions, workoutTemplates, workoutTypes, workoutVolumes } from './schema.js';

export async function entityKeys(db: Db, userId: string): Promise<string[]> {
  const sessions = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.userId, userId));
  const templates = await db.select({ id: workoutTemplates.id }).from(workoutTemplates).where(eq(workoutTemplates.userId, userId));
  const weights = await db.select({ id: bodyWeightEntries.measuredAt }).from(bodyWeightEntries).where(eq(bodyWeightEntries.userId, userId));
  return [...sessions.map(x => `workout:${x.id}`), ...templates.map(x => `template:${x.id}`), ...weights.map(x => `weight:${x.id}`), 'exclusions:all'];
}
export async function readEntity(db: Db, userId: string, key: string): Promise<SyncEntity | null> {
  const [kind, id] = key.split(':') as [string, string];
  if (kind === 'exclusions') {
    const rows = await db.select({ name: exercises.canonicalNameRu }).from(userExcludedExercises)
      .innerJoin(exercises, eq(exercises.id, userExcludedExercises.exerciseId)).where(eq(userExcludedExercises.userId, userId));
    return rows.length ? { kind: 'exclusions', id: 'all', names: rows.map(x => x.name).sort() } : null;
  }
  if (kind === 'weight') {
    const [row] = await db.select().from(bodyWeightEntries).where(and(eq(bodyWeightEntries.userId, userId), eq(bodyWeightEntries.measuredAt, id)));
    return row ? { kind: 'weight', id, value: String(Number(row.value)) } : null;
  }
  if (kind === 'template') {
    const [row] = await db.select({ template: workoutTemplates, type: workoutTypes.key, volume: workoutVolumes.key }).from(workoutTemplates)
      .innerJoin(workoutTypes, eq(workoutTypes.id, workoutTemplates.typeId)).innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutTemplates.volumeId))
      .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId)));
    if (!row) return null;
    const entries = await db.select({ name: exercises.canonicalNameRu, slotKey: templateExercises.slotKey, position: templateExercises.position, defaultSets: templateExercises.defaultSets }).from(templateExercises)
      .innerJoin(exercises, eq(exercises.id, templateExercises.exerciseId)).where(eq(templateExercises.templateId, id)).orderBy(templateExercises.position);
    return { kind: 'template', id, title: row.template.title, type: row.type, volume: row.volume, entries };
  }
  const [row] = await db.select({ session: workoutSessions, type: workoutTypes.key, volume: workoutVolumes.key }).from(workoutSessions)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutSessions.typeId)).innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutSessions.volumeId))
    .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)));
  if (!row) return null;
  const entries = await db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, id)).orderBy(sessionExercises.position);
  const sets = entries.length ? await db.select().from(sessionSets).where(inArray(sessionSets.sessionExerciseId, entries.map(x => x.id))).orderBy(sessionSets.setNumber) : [];
  const intervals = await db.select().from(sessionIntervals).where(eq(sessionIntervals.sessionId, id)).orderBy(sessionIntervals.startedAt);
  return {
    kind: 'workout', id, type: row.type, volume: row.volume, revision: row.session.revision, owningDeviceId: row.session.owningDeviceId, sourceTemplateId: row.session.sourceTemplateId,
    status: row.session.status, startedAt: row.session.startedAt.toISOString(), completedAt: row.session.completedAt?.toISOString() ?? null,
    exercises: entries.map(e => ({
      id: e.id, name: e.exerciseNameSnapshot, position: e.position, status: e.status,
      sets: sets.filter(s => s.sessionExerciseId === e.id).map(s => ({ id: s.id, setNumber: s.setNumber, weight: s.weight === null ? null : String(Number(s.weight)), reps: s.reps, completedAt: s.completedAt?.toISOString() ?? null }))
    })),
    intervals: intervals.map(x => ({ startedAt: x.startedAt.toISOString(), endedAt: x.endedAt?.toISOString() ?? null }))
  };
}

/** Caller provides a transaction; it also journals/acks the surrounding change. */
export async function writeEntity(db: Db, userId: string, key: string, entity: SyncEntity | null): Promise<void> {
  const [kind, id] = key.split(':') as [string, string];
  if (!entity) {
    if (kind === 'workout') await db.delete(workoutSessions).where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)));
    if (kind === 'template') await db.delete(workoutTemplates).where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId)));
    if (kind === 'weight') await db.delete(bodyWeightEntries).where(and(eq(bodyWeightEntries.userId, userId), eq(bodyWeightEntries.measuredAt, id)));
    if (kind === 'exclusions') await db.delete(userExcludedExercises).where(eq(userExcludedExercises.userId, userId));
    return;
  }
  const catalog = new Map((await db.select({ id: exercises.id, name: exercises.canonicalNameRu }).from(exercises)).map(x => [x.name, x.id]));
  const resolveExercise = (name: string) => { const found = catalog.get(name); if (!found) throw new Error(`Упражнение отсутствует в каталоге: ${name}`); return found; };
  if (entity.kind === 'exclusions') {
    const ids = [...new Set(entity.names.map(resolveExercise))];
    await db.delete(userExcludedExercises).where(eq(userExcludedExercises.userId, userId));
    if (ids.length) await db.insert(userExcludedExercises).values(ids.map(exerciseId => ({ userId, exerciseId })));
    return;
  }
  if (entity.kind === 'weight') {
    await db.insert(bodyWeightEntries).values({ userId, measuredAt: id, value: entity.value })
      .onConflictDoUpdate({ target: [bodyWeightEntries.userId, bodyWeightEntries.measuredAt], set: { value: entity.value } });
    return;
  }
  const [type] = await db.select().from(workoutTypes).where(eq(workoutTypes.key, entity.type));
  const [volume] = await db.select().from(workoutVolumes).where(eq(workoutVolumes.key, entity.volume));
  if (!type || !volume) throw new Error('Неизвестный тип или объём тренировки');
  if (entity.kind === 'template') {
    const values = entity.entries.map(e => ({ templateId: id, exerciseId: resolveExercise(e.name), slotKey: e.slotKey, position: e.position, defaultSets: e.defaultSets }));
    await db.insert(workoutTemplates).values({ id, userId, title: entity.title, typeId: type.id, volumeId: volume.id })
      .onConflictDoUpdate({ target: workoutTemplates.id, set: { title: entity.title, typeId: type.id, volumeId: volume.id, updatedAt: new Date() } });
    await db.delete(templateExercises).where(eq(templateExercises.templateId, id));
    if (values.length) await db.insert(templateExercises).values(values);
    return;
  }
  await db.insert(devices).values({ id: entity.owningDeviceId, userId, label: 'Другое устройство' }).onConflictDoNothing();
  const source = entity.sourceTemplateId ? await db.select({ id: workoutTemplates.id }).from(workoutTemplates).where(and(eq(workoutTemplates.id, entity.sourceTemplateId), eq(workoutTemplates.userId, userId))) : [];
  const values = {
    typeId: type.id, volumeId: volume.id, owningDeviceId: entity.owningDeviceId, sourceTemplateId: source[0]?.id ?? null, revision: entity.revision,
    status: entity.status, startedAt: new Date(entity.startedAt), completedAt: entity.completedAt ? new Date(entity.completedAt) : null, updatedAt: new Date()
  };
  await db.insert(workoutSessions).values({ id, userId, ...values }).onConflictDoUpdate({ target: workoutSessions.id, set: values });
  await db.delete(sessionExercises).where(eq(sessionExercises.sessionId, id));
  const exRows = entity.exercises.map(e => ({ id: e.id, sessionId: id, exerciseId: resolveExercise(e.name), exerciseNameSnapshot: e.name, position: e.position, status: e.status }));
  if (exRows.length) await db.insert(sessionExercises).values(exRows);
  const setRows = entity.exercises.flatMap(e => e.sets.map(s => ({ id: s.id, sessionExerciseId: e.id, setNumber: s.setNumber, weight: s.weight, reps: s.reps, completedAt: s.completedAt ? new Date(s.completedAt) : null })));
  if (setRows.length) await db.insert(sessionSets).values(setRows);
  await db.delete(sessionIntervals).where(eq(sessionIntervals.sessionId, id));
  if (entity.intervals.length) await db.insert(sessionIntervals).values(entity.intervals.map(x => ({ sessionId: id, startedAt: new Date(x.startedAt), endedAt: x.endedAt ? new Date(x.endedAt) : null })));
}
