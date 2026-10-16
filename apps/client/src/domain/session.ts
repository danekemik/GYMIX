import type { GeneratedWorkout } from '@gymix/generator';

export interface SetEntry {
  readonly weight: string;
  readonly reps: string;
  readonly done: boolean;
}

/** Снимок выполненной сессии: расширяется флагом сохранения для итога. */
export interface SessionSnapshot {
  readonly workout: GeneratedWorkout;
  readonly sets: readonly (readonly SetEntry[])[];
  /** Явно пропущенные упражнения (S10): не засчитываются в X/Y. */
  readonly skippedExercises?: readonly boolean[];
  readonly startedAt: number;
  readonly endedAt: number;
  /** Активное время без пауз (S10, LOCKED) — попадает в историю. */
  readonly durationMs?: number;
}

export interface FinishPayload extends SessionSnapshot {
  readonly saved: boolean;
}
