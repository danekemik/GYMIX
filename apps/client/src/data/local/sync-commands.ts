import type { SyncChange, SyncReply, SyncSnapshot } from '@gymix/contracts';

export type SyncCommand =
  | { kind: 'next' }
  | { kind: 'ack'; seq: number; key: string; reply: SyncReply }
  | { kind: 'snapshot'; snapshot: SyncSnapshot };
export interface SyncCommandReply {
  item?: { seq: number; change: SyncChange } | null;
  changed?: boolean;
}
