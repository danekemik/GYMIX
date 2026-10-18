import type { GeneratedWorkout } from '@gymix/generator';
import type { SessionSnapshot, SetEntry } from '../../domain/session';
import type { DraftSession, DraftSummary, HistoryItem } from '../../lib/session';
import type { WeeklyActivity } from '../../lib/weeklyActivity';

export type SessionCommand =
  | { kind: 'create'; workout: GeneratedWorkout }
  | { kind: 'persist'; draft: DraftSession; sets: readonly (readonly SetEntry[])[]; skipped: readonly boolean[] }
  | { kind: 'running'; sessionId: string; running: boolean; at: number }
  | { kind: 'delete'; sessionId: string }
  | { kind: 'finish'; draft: DraftSession; payload: SessionSnapshot };

export interface SessionCommandReply {
  value: DraftSession | undefined;
  active: DraftSummary | null;
  history?: HistoryItem[];
  week?: WeeklyActivity;
}
