import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  authSessions,
  emailCodes,
  users,
  workoutSessions,
} from '@gymix/db/schema';
import type { Db } from '@gymix/db/seed-data';
import type { AppContext } from './app.js';

/**
 * Фоновая очистка. Каждая задача берёт advisory lock в той же транзакции,
 * поэтому при нескольких инстансах сервера работу выполнит только один.
 * Тесты дергают функции напрямую с PGlite.
 */

export const STALE_SESSION_MS = 30 * 86_400_000;
export const FINALIZE_DELETED_MS = 7 * 86_400_000;

const LOCK = {
  authSessions: 10_071,
  staleSessions: 10_072,
  emailCodes: 10_073,
  finalizeDeletions: 10_074,
} as const;

export interface CleanupJob {
  key: number;
  name: string;
  run: (db: Db, now: Date) => Promise<number>;
}

export function cleanupJobs(): CleanupJob[] {
  return [
    {
      key: LOCK.authSessions,
      name: 'auth_sessions',
      run: cleanupExpiredAuthSessions,
    },
    {
      key: LOCK.staleSessions,
      name: 'stale_sessions',
      run: cleanupStaleSessions,
    },
    {
      key: LOCK.emailCodes,
      name: 'email_codes',
      run: cleanupExpiredCodes,
    },
    {
      key: LOCK.finalizeDeletions,
      name: 'finalize_deletions',
      run: finalizeDeletedAccounts,
    },
  ];
}

/** Истёкшие и отозванные refresh-сессии (TTL сессии — 30 дней). */
export async function cleanupExpiredAuthSessions(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, now))
    .returning({ id: authSessions.id });
  return rows.length;
}

/** Незавершённые тренировки старше 30 дней (LOCKED): каскад чистит всё. */
export async function cleanupStaleSessions(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_SESSION_MS);
  const rows = await db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.status, 'active'), lt(workoutSessions.startedAt, cutoff)))
    .returning({ id: workoutSessions.id });
  return rows.length;
}

/** Коды подтверждения после истечения не нужны даже для аудита. */
export async function cleanupExpiredCodes(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(emailCodes)
    .where(lt(emailCodes.expiresAt, now))
    .returning({ id: emailCodes.id });
  return rows.length;
}

/** Grace-период истёк — пользователь и все его данные стираются. */
export async function finalizeDeletedAccounts(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - FINALIZE_DELETED_MS);
  const rows = await db
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)))
    .returning({ id: users.id });
  return rows.length;
}

/**
 * Планировщик: запускает задачи с интервалом, каждая — с advisory lock.
 */
export class JobRunner {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ctx: AppContext) { }

  start(intervalMs: number): void {
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.ctx.logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'фоновый цикл упал',
        );
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    for (const job of cleanupJobs()) {
      try {
        await this.runOnce(job);
      } catch (error) {
        this.ctx.logger.error(
          { job: job.name, error: error instanceof Error ? error.message : String(error) },
          'фоновая задача упала',
        );
      }
    }
  }

  private async runOnce(job: CleanupJob): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      const res = (await tx.execute(
        sql`select pg_try_advisory_xact_lock(${job.key}) as locked`,
      )) as { rows: Array<{ locked: boolean; }>; };
      if (!(res.rows[0]?.locked ?? false)) return;
      const removed = await job.run(tx as unknown as Db, this.ctx.clock());
      if (removed > 0) {
        this.ctx.logger.info({ job: job.name, removed }, 'фоновая очистка');
      }
    });
  }
}
