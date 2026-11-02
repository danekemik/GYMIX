import { and, eq, gte, lte } from 'drizzle-orm';
import { workoutSessions } from '@gymix/db/schema';
import type { GymixDb } from './db';

export function weekStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
}

export interface WeeklyActivity { count: number; days: number[]; }

export async function weeklyActivity(db: GymixDb, now = new Date()): Promise<WeeklyActivity> {
  const start = weekStart(now);
  const rows = await db.db.select({ date: workoutSessions.completedAt }).from(workoutSessions)
    .where(and(eq(workoutSessions.userId, db.account.userId), eq(workoutSessions.status, 'completed'), gte(workoutSessions.completedAt, start), lte(workoutSessions.completedAt, now)));
  const days = Array<number>(7).fill(0);
  for (const row of rows) if (row.date) {
    const day = (row.date.getDay() + 6) % 7;
    days[day] = (days[day] ?? 0) + 1;
  }
  return { count: rows.length, days };
}
