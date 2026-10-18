import type { GeneratedWorkout } from '@gymix/generator';
import type { SessionSnapshot, SetEntry } from '../../domain/session';
import type { DraftSession, DraftSummary, HistoryItem } from '../../lib/session';
import type { WeeklyActivity } from '../../lib/weeklyActivity';
import type { TemplateCard, TemplateInput } from '../../lib/templates';
import type { ExcludedExercise } from '../../lib/exclusions';
import type { RecordPatch, RecordSnapshot } from '../../lib/record';

export type SessionCommand =
  | { kind: 'create'; workout: GeneratedWorkout }
  | { kind: 'persist'; draft: DraftSession; sets: readonly (readonly SetEntry[])[]; skipped: readonly boolean[] }
  | { kind: 'running'; sessionId: string; running: boolean; at: number }
  | { kind: 'delete'; sessionId: string }
  | { kind: 'finish'; draft: DraftSession; payload: SessionSnapshot }
  | { kind: 'save-template'; input: TemplateInput }
  | { kind: 'save-record'; sessionId: string; patch: RecordPatch }
  | { kind: 'exclude'; name: string; excluded: boolean };

export interface SessionCommandReply {
  value: DraftSession | string | undefined;
  active: DraftSummary | null;
  history?: HistoryItem[];
  week?: WeeklyActivity;
  templates?: TemplateCard[];
  exclusions?: ExcludedExercise[];
  record?: RecordSnapshot;
}
