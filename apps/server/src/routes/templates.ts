import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  exercises,
  templateExercises,
  workoutTemplates,
  workoutTypes,
  workoutVolumes,
} from '@gymix/db/schema';
import type { AppContext } from '../app.js';
import { HttpError } from '../errors.js';
import { getPrincipal, requireAuth } from '../auth-mid.js';
import { readJson } from '../web.js';

/**
 * Шаблоны пользователя: готовые планы для быстрого старта. Хранятся
 * слаботипизированно (снимки имён), чтобы не гонять каталог из БД на
 * каждый список.
 */

const entrySchema = z.object({
  exerciseName: z.string().min(1).max(120),
  slotKey: z.string().min(1).max(64),
  position: z.number().int().positive(),
  defaultSets: z.number().int().positive().max(20),
});

export interface TemplateView {
  id: string;
  title: string;
  type: string;
  volume: string;
  createdAt: string;
  updatedAt: string;
  entries: Array<{
    id: string;
    exerciseId: string;
    exerciseName: string;
    slotKey: string;
    position: number;
    defaultSets: number;
  }>;
}

export function templatesRouter(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('/templates', requireAuth(ctx));
  app.use('/templates/*', requireAuth(ctx));
  const read = (c: Parameters<typeof readJson>[0]) => readJson(c);

  app.get('/templates', async (c) => {
    const { userId } = getPrincipal(c);
    const list = await listTemplates(ctx, userId);
    return c.json({ templates: list });
  });

  app.post('/templates', async (c) => {
    const { userId } = getPrincipal(c);
    const body = z
      .object({
        title: z.string().trim().min(1).max(60),
        type: z.string().min(1),
        volume: z.string().min(1),
        entries: z.array(entrySchema).min(1).max(60),
      })
      .parse(await read(c));

    const template = await resolveTypeVolume(ctx, body.type, body.volume);
    const exerciseIds = await resolveExerciseIds(ctx, body.entries.map((e) => e.exerciseName));
    assertPositions(body.entries.map((e) => e.position));

    const created = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(workoutTemplates)
        .values({ userId, title: body.title, typeId: template.typeId, volumeId: template.volumeId })
        .returning();

      await tx.insert(templateExercises).values(
        body.entries.map((entry) => ({
          templateId: created!.id,
          exerciseId: exerciseIds.get(entry.exerciseName)!,
          slotKey: entry.slotKey,
          position: entry.position,
          defaultSets: entry.defaultSets,
        })),
      );
      return created!;
    });
    const view = await getTemplate(ctx, created!.id, userId);
    return c.json({ template: view }, 201);
  });

  app.patch('/templates/:id', async (c) => {
    const { userId } = getPrincipal(c);
    const templateId = z.string().uuid().parse(c.req.param('id'));
    await requireOwnTemplate(ctx, templateId, userId);
    const body = z.object({ title: z.string().trim().min(1).max(60) }).parse(await read(c));
    await ctx.db
      .update(workoutTemplates)
      .set({ title: body.title, updatedAt: ctx.clock() })
      .where(eq(workoutTemplates.id, templateId));
    const view = await getTemplate(ctx, templateId, userId);
    return c.json({ template: view });
  });

  app.put('/templates/:id', async (c) => {
    const { userId } = getPrincipal(c);
    const templateId = z.string().uuid().parse(c.req.param('id'));
    await requireOwnTemplate(ctx, templateId, userId);
    const body = z
      .object({
        entries: z.array(entrySchema).min(1).max(60),
      })
      .parse(await read(c));
    const exerciseIds = await resolveExerciseIds(ctx, body.entries.map((e) => e.exerciseName));
    assertPositions(body.entries.map((e) => e.position));

    await ctx.db.transaction(async (tx) => {
      await tx.delete(templateExercises).where(eq(templateExercises.templateId, templateId));
      await tx.insert(templateExercises).values(
        body.entries.map((entry) => ({
          templateId,
          exerciseId: exerciseIds.get(entry.exerciseName)!,
          slotKey: entry.slotKey,
          position: entry.position,
          defaultSets: entry.defaultSets,
        })),
      );
      await tx
        .update(workoutTemplates)
        .set({ updatedAt: ctx.clock() })
        .where(eq(workoutTemplates.id, templateId));
    });
    const view = await getTemplate(ctx, templateId, userId);
    return c.json({ template: view });
  });

  app.post('/templates/:id/copy', async (c) => {
    const { userId } = getPrincipal(c);
    const templateId = z.string().uuid().parse(c.req.param('id'));
    await requireOwnTemplate(ctx, templateId, userId);
    const source = await getTemplate(ctx, templateId, userId);
    const { typeId, volumeId } = await resolveTypeVolume(ctx, source.type, source.volume);
    const created = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(workoutTemplates)
        .values({
          userId,
          title: `${source.title} (копия)`,
          typeId,
          volumeId,
        })
        .returning();
      await tx.insert(templateExercises).values(
        source.entries.map((entry) => ({
          templateId: created!.id,
          exerciseId: entry.exerciseId,
          slotKey: entry.slotKey,
          position: entry.position,
          defaultSets: entry.defaultSets,
        })),
      );
      return created!;
    });
    const view = await getTemplate(ctx, created!.id, userId);
    return c.json({ template: view }, 201);
  });

  app.delete('/templates/:id', async (c) => {
    const { userId } = getPrincipal(c);
    const templateId = z.string().uuid().parse(c.req.param('id'));
    await requireOwnTemplate(ctx, templateId, userId);
    await ctx.db.delete(workoutTemplates).where(eq(workoutTemplates.id, templateId));
    return c.body(null, 204);
  });

  return app;
}

export async function listTemplates(ctx: AppContext, userId: string): Promise<TemplateView[]> {
  const templates = await ctx.db
    .select({
      template: workoutTemplates,
      type: workoutTypes.key,
      volume: workoutVolumes.key,
    })
    .from(workoutTemplates)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutTemplates.typeId))
    .innerJoin(workoutVolumes, eq(workoutVolumes.id, workoutTemplates.volumeId))
    .where(eq(workoutTemplates.userId, userId))
    .orderBy(workoutTemplates.createdAt);

  if (templates.length === 0) return [];

  const entries = await ctx.db
    .select({
      entry: templateExercises,
      exerciseName: exercises.canonicalNameRu,
    })
    .from(templateExercises)
    .innerJoin(exercises, eq(exercises.id, templateExercises.exerciseId))
    .where(
      inArray(
        templateExercises.templateId,
        templates.map((t) => t.template.id),
      ),
    )
    .orderBy(templateExercises.position);

  return templates.map(({ template, type, volume }) => ({
    id: template.id,
    title: template.title,
    type,
    volume,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    entries: entries
      .filter((e) => e.entry.templateId === template.id)
      .map(({ entry, exerciseName }) => ({
        id: entry.id,
        exerciseId: entry.exerciseId,
        exerciseName,
        slotKey: entry.slotKey,
        position: entry.position,
        defaultSets: entry.defaultSets,
      })),
  }));
}

async function getTemplate(ctx: AppContext, templateId: string, userId: string): Promise<TemplateView> {
  const list = await listTemplates(ctx, userId);
  const found = list.find((t) => t.id === templateId);
  if (!found) throw HttpError.notFound('Шаблон не найден');
  return found;
}

async function requireOwnTemplate(ctx: AppContext, templateId: string, userId: string): Promise<void> {
  const [row] = await ctx.db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)));
  if (!row) throw HttpError.notFound('Шаблон не найден');
}

async function resolveTypeVolume(
  ctx: AppContext,
  type: string,
  volume: string,
): Promise<{ typeId: string; volumeId: string; }> {
  const [typeRow] = await ctx.db
    .select({ id: workoutTypes.id })
    .from(workoutTypes)
    .where(eq(workoutTypes.key, type));
  const [volumeRow] = await ctx.db
    .select({ id: workoutVolumes.id })
    .from(workoutVolumes)
    .where(eq(workoutVolumes.key, volume));
  if (!typeRow) throw HttpError.invalidRequest(`Неизвестный тип: ${type}`);
  if (!volumeRow) throw HttpError.invalidRequest(`Неизвестный объём: ${volume}`);
  return { typeId: typeRow.id, volumeId: volumeRow.id };
}

async function resolveExerciseIds(
  ctx: AppContext,
  names: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(names)];
  const rows = await ctx.db
    .select({ id: exercises.id, name: exercises.canonicalNameRu })
    .from(exercises)
    .where(inArray(exercises.canonicalNameRu, unique));
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  const unknown = unique.filter((name) => !byName.has(name));
  if (unknown.length > 0) {
    throw new HttpError(400, 'unknown_exercise', `Неизвестные упражнения: ${unknown.join(', ')}`);
  }
  return byName;
}

function assertPositions(positions: number[]): void {
  if (new Set(positions).size !== positions.length) {
    throw HttpError.invalidRequest('Позиции не должны повторяться');
  }
}