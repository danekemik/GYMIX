import { z } from 'zod';
const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true });
const weight = z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/).nullable();
const statuses = ['pending', 'active', 'completed', 'skipped'] as const;
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const setSchema = z.object({ id: uuid, setNumber: z.number().int().min(1).max(100), weight, reps: z.number().int().min(0).max(10000).nullable(), completedAt: dateTime.nullable() });
const exerciseSchema = z.object({ id: uuid, name: z.string().min(1).max(200), position: z.number().int().min(1).max(60), status: z.enum(statuses), sets: z.array(setSchema).max(100) }).refine(e => unique(e.sets.map(s => s.setNumber)) && unique(e.sets.map(s => s.id)), 'Повторяются подходы');
export const syncEntitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workout'), id: uuid, type: z.string().min(1), volume: z.string().min(1), revision: z.number().int().positive(), owningDeviceId: uuid, sourceTemplateId: uuid.nullable(), status: z.enum(['active', 'completed']), startedAt: dateTime, completedAt: dateTime.nullable(), exercises: z.array(exerciseSchema).min(1).max(60), intervals: z.array(z.object({ startedAt: dateTime, endedAt: dateTime.nullable() })).max(10000) }).superRefine((e, ctx) => {
    if (!unique(e.exercises.map(x => x.id)) || e.exercises.some((x, i) => x.position !== i + 1)) ctx.addIssue({ code: 'custom', message: 'Неверный порядок упражнений' });
    if (e.status === 'completed' && (!e.completedAt || Date.parse(e.completedAt) < Date.parse(e.startedAt))) ctx.addIssue({ code: 'custom', message: 'Неверная дата завершения' });
    if (e.status === 'active' && e.completedAt !== null) ctx.addIssue({ code: 'custom', message: 'Активная тренировка не завершена' });
    if (e.intervals.filter(x => x.endedAt === null).length > 1 || e.intervals.some(x => x.endedAt && Date.parse(x.endedAt) < Date.parse(x.startedAt)) || (e.status === 'completed' && e.intervals.some(x => x.endedAt === null))) ctx.addIssue({ code: 'custom', message: 'Некорректные интервалы таймера' });
  }),
  z.object({ kind: z.literal('template'), id: uuid, title: z.string().trim().min(1).max(80), type: z.string().min(1), volume: z.string().min(1), entries: z.array(z.object({ name: z.string().min(1).max(200), slotKey: z.string().min(1).max(64), position: z.number().int().min(1).max(60), defaultSets: z.number().int().min(1).max(100) })).min(1).max(60) }).refine(e => e.entries.every((x, i) => x.position === i + 1), 'Неверный порядок упражнений'),
  z.object({ kind: z.literal('weight'), id: z.string().date(), value: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/) }),
  z.object({ kind: z.literal('exclusions'), id: z.literal('all'), names: z.array(z.string().min(1).max(200)).max(500) }),
]);
export type SyncEntity = z.infer<typeof syncEntitySchema>;
export type WorkoutEntity = Extract<SyncEntity, { kind: 'workout'; }>;
export const syncKeySchema = z.string().regex(/^(workout:[0-9a-f-]{36}|template:[0-9a-f-]{36}|weight:\d{4}-\d{2}-\d{2}|exclusions:all)$/i);
export const syncChangeSchema = z.object({ operationId: uuid, key: syncKeySchema, baseVersion: z.string().regex(/^[0-9a-f]{64}$/).nullable(), payload: syncEntitySchema.nullable(), claim: z.boolean().default(false) }).refine(x => !x.payload || entityKey(x.payload) === x.key, 'Ключ не совпадает с записью');
export type SyncChange = z.infer<typeof syncChangeSchema>;
export interface SyncRecord { key: string; payload: SyncEntity | null; version: string | null; }
export interface SyncReply { accepted: boolean; reason?: 'conflict' | 'ownership_required' | 'operation_rejected'; message?: string; record: SyncRecord; }
export interface SyncSnapshot { userId: string; records: SyncRecord[]; }
export function entityKey(entity: SyncEntity): string { return `${entity.kind}:${entity.id}`; }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
