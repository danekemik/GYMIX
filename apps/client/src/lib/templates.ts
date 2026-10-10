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
export async function saveTemplate(db: GymixDb, input: TemplateInput): Promise<void> {
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

export async function renameTemplate(db: GymixDb, templateId: string, title: string): Promise<void> {
  await db.db
    .update(workoutTemplates)
    .set({ title, updatedAt: new Date() })
    .where(eq(workoutTemplates.id, templateId));
}

export async function copyTemplate(db: GymixDb, templateId: string): Promise<void> {
  const source = await loadTemplate(db, templateId);
  const owner = await ensureLocalOwner(db);
  const [copy] = await db.db
    .insert(workoutTemplates)
    .values({
      userId: owner.userId,
      title: `${source.title} · копия`,
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
}

export async function deleteTemplate(db: GymixDb, templateId: string): Promise<void> {
  await db.db.delete(workoutTemplates).where(eq(workoutTemplates.id, templateId));
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