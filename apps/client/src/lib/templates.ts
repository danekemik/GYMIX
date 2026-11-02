import { localChange } from '../data/sync/store';
import { runSessionCommand } from '../data/local/read-rpc';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { GeneratedWorkout } from '@gymix/generator';
import {
  exercises,
  templateExercises,
  workoutTemplates,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import type { VolumeLevel, WorkoutType } from '@gymix/structures';
import type { GymixDb } from './db';
import { buildWorkoutFromEntries } from './reconstruct';
import { ensureLocalOwner } from './session';

export interface TemplateCard {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly volume: string;
  readonly exerciseCount: number;
  readonly createdAt: Date;
}

export interface TemplateInputEntry {
  readonly slotKey: string;
  readonly exerciseName: string;
}

export interface TemplateInput {
  readonly title: string;
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  readonly entries: readonly TemplateInputEntry[];
}

/** Сохранить выполненную тренировку как шаблон (S03). */
async function _saveTemplate(db: GymixDb, input: TemplateInput): Promise<string> {
  const owner = await ensureLocalOwner(db);
  const typeId = (
    await db.db.select({ id: workoutTypes.id }).from(workoutTypes).where(eq(workoutTypes.key, input.type)).limit(1)
  )[0]?.id;
  const volumeId = (
    await db.db.select({ id: workoutVolumes.id }).from(workoutVolumes).where(eq(workoutVolumes.key, input.volume)).limit(1)
  )[0]?.id;
  if (typeId === undefined || volumeId === undefined) {
    throw new Error(`нет справочника тип/объём для ${input.type} · ${input.volume}`);
  }

  const [template] = await db.db
    .insert(workoutTemplates)
    .values({ userId: owner.userId, title: input.title, typeId, volumeId })
    .returning({ id: workoutTemplates.id });
  if (template === undefined) throw new Error('шаблон не создан');

  const nameRows = await db.db
    .select({ id: exercises.id, name: exercises.canonicalNameRu })
    .from(exercises);
  const byName = new Map(nameRows.map((r) => [r.name, r.id]));

  const values: Array<{
    templateId: string;
    exerciseId: string;
    slotKey: string;
    position: number;
  }> = [];
  for (const [index, entry] of input.entries.entries()) {
    const exerciseId = byName.get(entry.exerciseName);
    if (exerciseId === undefined) {
      throw new Error('среди упражнений есть вне каталога — шаблон не сохранён');
    }
    values.push({ templateId: template.id, exerciseId, slotKey: entry.slotKey, position: index + 1 });
  }
  await db.db.insert(templateExercises).values(values);
  return template.id;
}

/** Список шаблонов от новых к старым. */
export async function templatesFor(db: GymixDb): Promise<TemplateCard[]> {
  const owner = await ensureLocalOwner(db);
  const rows = await db.db
    .select({
      id: workoutTemplates.id,
      title: workoutTemplates.title,
      type: workoutTypes.key,
      volume: workoutVolumes.key,
      createdAt: workoutTemplates.createdAt,
    })
    .from(workoutTemplates)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutTemplates.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutTemplates.volumeId))
    .where(eq(workoutTemplates.userId, owner.userId))
    .orderBy(desc(workoutTemplates.createdAt));

  const counts = await db.db
    .select({
      templateId: templateExercises.templateId,
      n: sql<number>`count(*)::int`,
    })
    .from(templateExercises)
    .groupBy(templateExercises.templateId);

  const countBy = new Map(counts.map((c) => [c.templateId, c.n]));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    volume: row.volume,
    exerciseCount: countBy.get(row.id) ?? 0,
    createdAt: row.createdAt,
  }));
}

async function _renameTemplate(db: GymixDb, templateId: string, title: string, previousTitle?: string): Promise<void> {
  if (previousTitle !== undefined) {
    const [current] = await db.db.select().from(workoutTemplates).where(eq(workoutTemplates.id, templateId));
    if (!current || current.title !== previousTitle) throw new Error('Название изменилось на другом устройстве. Обновите список перед переименованием.');
  }
  await db.db
    .update(workoutTemplates)
    .set({ title, updatedAt: new Date() })
    .where(eq(workoutTemplates.id, templateId));
}

export function copyTitle(sourceTitle: string, taken: ReadonlySet<string>): string {
  // Не наследуем суффикс копии, иначе появляются «X · копия · копия».
  const base = `${sourceTitle.replace(/(?: · копия)+(?: \d+)?$/, '')} · копия`;
  let title = base;
  for (let n = 2; taken.has(title); n += 1) title = `${base} ${n}`;
  return title;
}

async function _copyTemplate(db: GymixDb, templateId: string): Promise<string> {
  const source = await loadTemplate(db, templateId);
  const owner = await ensureLocalOwner(db);
  const existing = await db.db
    .select({ title: workoutTemplates.title })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.userId, owner.userId));
  const title = copyTitle(source.title, new Set(existing.map((row) => row.title)));
  const [copy] = await db.db
    .insert(workoutTemplates)
    .values({
      userId: owner.userId,
      title,
      typeId: source.typeId,
      volumeId: source.volumeId,
    })
    .returning({ id: workoutTemplates.id });
  if (copy === undefined) throw new Error('копия шаблона не создана');

  await db.db
    .insert(templateExercises)
    .values(
      source.entries.map((entry) => ({
        templateId: copy.id,
        exerciseId: entry.exerciseId,
        slotKey: entry.slotKey,
        position: entry.position,
        defaultSets: entry.defaultSets,
      })),
    );
  return copy.id;
}

async function _deleteTemplate(db: GymixDb, templateId: string): Promise<void> {
  await db.db.delete(workoutTemplates).where(eq(workoutTemplates.id, templateId));
}

/** Сохранить изменённый состав шаблона, не создавая копию. */
async function _updateTemplate(db: GymixDb, templateId: string, input: TemplateInput): Promise<void> {
  const [current] = await db.db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId));
  if (current === undefined) throw new Error('Шаблон не найден — возможно, его удалили на другом устройстве.');

  const typeId = (
    await db.db.select({ id: workoutTypes.id }).from(workoutTypes).where(eq(workoutTypes.key, input.type)).limit(1)
  )[0]?.id;
  const volumeId = (
    await db.db.select({ id: workoutVolumes.id }).from(workoutVolumes).where(eq(workoutVolumes.key, input.volume)).limit(1)
  )[0]?.id;
  if (typeId === undefined || volumeId === undefined) {
    throw new Error(`нет справочника тип/объём для ${input.type} · ${input.volume}`);
  }

  const nameRows = await db.db.select({ id: exercises.id, name: exercises.canonicalNameRu }).from(exercises);
  const byName = new Map(nameRows.map((row) => [row.name, row.id]));
  const values = input.entries.map((entry, index) => {
    const exerciseId = byName.get(entry.exerciseName);
    if (exerciseId === undefined) {
      throw new Error('среди упражнений есть вне каталога — шаблон не сохранён');
    }
    return { templateId, exerciseId, slotKey: entry.slotKey, position: index + 1 };
  });

  await db.db
    .update(workoutTemplates)
    .set({ title: input.title, typeId, volumeId, updatedAt: new Date() })
    .where(eq(workoutTemplates.id, templateId));
  await db.db.delete(templateExercises).where(eq(templateExercises.templateId, templateId));
  if (values.length > 0) await db.db.insert(templateExercises).values(values);
}

/** Собрать тренировку из шаблона для предпросмотра и выполнения (S03 → S08). */
export async function workoutFromTemplate(
  db: GymixDb,
  templateId: string,
): Promise<GeneratedWorkout> {
  const template = await loadTemplate(db, templateId);
  return buildWorkoutFromEntries(
    template.type,
    template.volume,
    template.entries.map((entry) => ({ slotKey: entry.slotKey, exerciseName: entry.exerciseName })),
  );
}

interface LoadedTemplate {
  readonly id: string;
  readonly title: string;
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  readonly typeId: string;
  readonly volumeId: string;
  readonly entries: readonly {
    readonly exerciseId: string;
    readonly exerciseName: string;
    readonly slotKey: string;
    readonly position: number;
    readonly defaultSets: number;
  }[];
}

async function loadTemplate(db: GymixDb, templateId: string): Promise<LoadedTemplate> {
  const rows = await db.db
    .select({
      id: workoutTemplates.id,
      title: workoutTemplates.title,
      type: workoutTypes.key,
      volume: workoutVolumes.key,
      typeId: workoutTemplates.typeId,
      volumeId: workoutTemplates.volumeId,
      exerciseId: templateExercises.exerciseId,
      exerciseName: exercises.canonicalNameRu,
      slotKey: templateExercises.slotKey,
      position: templateExercises.position,
      defaultSets: templateExercises.defaultSets,
    })
    .from(workoutTemplates)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutTemplates.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutTemplates.volumeId))
    .innerJoin(templateExercises, eq(templateExercises.templateId, workoutTemplates.id))
    .innerJoin(exercises, eq(exercises.id, templateExercises.exerciseId))
    .where(eq(workoutTemplates.id, templateId))
    .orderBy(asc(templateExercises.position));

  const first = rows[0];
  if (first === undefined) throw new Error('шаблон не найден');
  return {
    id: first.id,
    title: first.title,
    type: first.type as WorkoutType,
    volume: first.volume as VolumeLevel,
    typeId: first.typeId,
    volumeId: first.volumeId,
    entries: rows.map((row) => ({
      exerciseId: row.exerciseId,
      exerciseName: row.exerciseName,
      slotKey: row.slotKey,
      position: row.position,
      defaultSets: row.defaultSets,
    })),
  };
}
export const saveTemplate = async (db: GymixDb, input: TemplateInput): Promise<string> => {
  const remote = runSessionCommand(db, { kind: 'save-template', input });
  if (!remote) return localChange(db, id => `template:${id}`, scoped => _saveTemplate(scoped, input));
  const id = await remote;
  if (typeof id !== 'string') throw new Error('Не удалось сохранить шаблон');
  return id;
};
export const renameTemplate = (db: GymixDb, id: string, title: string, previousTitle?: string) => localChange(db, `template:${id}`, scoped => _renameTemplate(scoped, id, title, previousTitle));
export const updateTemplate = (db: GymixDb, id: string, input: TemplateInput) => localChange(db, `template:${id}`, scoped => _updateTemplate(scoped, id, input));
export const copyTemplate = (db: GymixDb, id: string) => localChange(db, copyId => `template:${copyId}`, scoped => _copyTemplate(scoped, id));
export const deleteTemplate = (db: GymixDb, id: string) => localChange(db, `template:${id}`, scoped => _deleteTemplate(scoped, id));
