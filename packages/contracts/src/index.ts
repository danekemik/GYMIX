import { z } from 'zod';

export const EXERCISE_STATUSES = ['pending', 'active', 'completed', 'skipped'] as const;
export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];

export interface OpBase {
  operationId: string;
  payload: Record<string, unknown>;
}

export type Op =
  | (OpBase & {
    type: 'set_upsert';
    payload: {
      sessionExerciseId: string;
      setNumber: number;
      weight?: number | string | null | undefined;
      reps?: number | null | undefined;
      completedAt?: string | null | undefined;
    };
  })
  | (OpBase & { type: 'set_add'; payload: { sessionExerciseId: string; setNumber: number; }; })
  | (OpBase & { type: 'exercise_status'; payload: { sessionExerciseId: string; status: ExerciseStatus; }; })
  | (OpBase & { type: 'exercise_position'; payload: { sessionExerciseId: string; position: number; }; })
  | (OpBase & { type: 'interval_open'; payload: Record<string, never>; })
  | (OpBase & { type: 'interval_close'; payload: Record<string, never>; })
  | (OpBase & { type: 'finish'; payload: { completedAt?: string | undefined; }; })
  | (OpBase & { type: 'transfer_ownership'; payload: Record<string, never>; });

const uuid = z.string().uuid();

const opSchemas = {
  set_upsert: z.object({
    type: z.literal('set_upsert'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      setNumber: z.number().int().positive().max(100),
      weight: z.union([z.number().finite().min(0).max(9999.99), z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/)]).nullable().optional(),
      reps: z.number().int().min(0).max(10000).nullable().optional(),
      completedAt: z.string().datetime({ offset: true }).nullable().optional(),
    }),
  }),
  set_add: z.object({
    type: z.literal('set_add'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      setNumber: z.number().int().positive().max(100),
    }),
  }),
  exercise_status: z.object({
    type: z.literal('exercise_status'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      status: z.enum(EXERCISE_STATUSES),
    }),
  }),
  exercise_position: z.object({
    type: z.literal('exercise_position'),
    operationId: uuid,
    payload: z.object({
      sessionExerciseId: uuid,
      position: z.number().int().positive(),
    }),
  }),
  interval_open: z.object({
    type: z.literal('interval_open'),
    operationId: uuid,
    payload: z.object({}).strict(),
  }),
  interval_close: z.object({
    type: z.literal('interval_close'),
    operationId: uuid,
    payload: z.object({}).strict(),
  }),
  finish: z.object({
    type: z.literal('finish'),
    operationId: uuid,
    payload: z.object({
      completedAt: z.string().datetime({ offset: true }).optional(),
    }),
  }),
  transfer_ownership: z.object({
    type: z.literal('transfer_ownership'),
    operationId: uuid,
    payload: z.object({}).strict(),
  }),
};


export const operationSchema = z.discriminatedUnion('type', [opSchemas.set_upsert, opSchemas.set_add, opSchemas.exercise_status, opSchemas.exercise_position, opSchemas.interval_open, opSchemas.interval_close, opSchemas.finish, opSchemas.transfer_ownership]);
export const operationBatchSchema = z.object({ expectedRevision: z.number().int().positive(), ops: z.array(operationSchema).min(1).max(100) });

export type ErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'invalid_code'
  | 'invalid_refresh'
  | 'requires_verification'
  | 'account_deleted'
  | 'email_taken'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'session_conflict'
  | 'ownership_required'
  | 'operation_rejected'
  | 'unknown_exercise'
  | 'rate_limited'
  | 'internal';


export interface ApplyOpsResult {
  revision: number;
  applied: string[];
  skipped: string[];
  rejected: Array<{ operationId: string; code: ErrorCode; message: string; }>;
  conflict: boolean;
  sessionStatus: 'active' | 'completed';
  owningDeviceId: string;
}

