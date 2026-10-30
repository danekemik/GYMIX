import { activeDraft, createDraft, deleteDraft, finishDraft, persistDraft, sessionsForHistory, setDraftRunning } from '../../lib/session';
import { weeklyActivity } from '../../lib/weeklyActivity';
import type { GymixDb } from '../../lib/db';
import type { SessionCommand, SessionCommandReply } from './session-commands';
import { saveTemplate, templatesFor } from '../../lib/templates';
import { excludeExerciseByName, includeExerciseByName, listExcluded } from '../../lib/exclusions';
import { loadRecord, saveRecord } from '../../lib/record';

/** Runs next to PostgreSQL. Public functions retain transactions and outbox checks;
 * this source has no RPC client, so they execute locally rather than forwarding. */
export async function executeSessionCommand(db: GymixDb, command: SessionCommand): Promise<SessionCommandReply> {
  let value;
  switch (command.kind) {
    case 'create': value = await createDraft(db, command.workout); break;
    case 'persist': await persistDraft(db, command.draft.sessionId, command.draft.byPosition, command.sets, command.skipped); break;
    case 'running': await setDraftRunning(db, command.sessionId, command.running, command.at); break;
    case 'delete': await deleteDraft(db, command.sessionId); break;
    case 'finish': await finishDraft(db, command.draft, command.payload); break;
    case 'save-template': value = await saveTemplate(db, command.input); break;
    case 'save-record': await saveRecord(db, command.sessionId, command.patch); break;
    case 'exclude': await (command.excluded ? excludeExerciseByName(db, command.name) : includeExerciseByName(db, command.name)); break;
    default: throw new Error('Неизвестное действие тренировки');
  }
  // The caller wraps the command and its visible state in one transaction.
  const active = await activeDraft(db);
  if (command.kind === 'save-template') return { value, active, templates: await templatesFor(db) };
  if (command.kind === 'exclude') return { value, active, exclusions: await listExcluded(db) };
  if (command.kind === 'save-record') return { value, active, history: await sessionsForHistory(db), week: await weeklyActivity(db), record: await loadRecord(db, command.sessionId) };
  if (command.kind !== 'finish') return { value, active };
  return { value, active, history: await sessionsForHistory(db), week: await weeklyActivity(db) };
}
