import type { GeneratedWorkout } from '@gymix/generator';
import type { VolumeLevel, WorkoutType } from '@gymix/structures';
import type { GymixDb } from './db';
import { buildWorkoutFromEntries } from './reconstruct';
import { saveSession } from './session';

/**
 * Демо-заполнение истории завершённых тренировок. Работает ТОЛЬКО в dev
 * (import.meta.env.DEV) и один раз на браузер: чтобы можно было посмотреть,
 * как выглядят блоки «Последние тренировки» и «История» с данными.
 * Если в БД уже есть завершённые сессии — ничего не добавляем.
 */
const DEMO_KEY = 'gymix:demo-seeded-v1';

interface DemoSpec {
  readonly type: WorkoutType;
  readonly volume: VolumeLevel;
  readonly exercises: number;
  readonly durationMin: number;
  readonly daysAgo: number;
  readonly weightFrom: number;
  readonly weightTo: number;
}

const DEMO_SPECS: readonly DemoSpec[] = [
  { type: 'Full Body', volume: 'Расширенная', exercises: 10, durationMin: 53, daysAgo: 1, weightFrom: 20, weightTo: 60 },
  { type: 'Upper Body', volume: 'Стандартная', exercises: 7, durationMin: 34, daysAgo: 3, weightFrom: 15, weightTo: 45 },
  { type: 'Legs', volume: 'Стандартная', exercises: 6, durationMin: 41, daysAgo: 6, weightFrom: 30, weightTo: 90 },
  { type: 'Push', volume: 'Компактная', exercises: 4, durationMin: 26, daysAgo: 9, weightFrom: 10, weightTo: 40 },
];

function shuffleNames(names: readonly string[], count: number): string[] {
  const copy = names.filter((name): name is string => name !== undefined);
  const picked: string[] = [];
  while (picked.length < count && copy.length > 0) {
    const index = Math.floor(Math.random() * copy.length);
    const item = copy.splice(index, 1)[0];
    if (item !== undefined) picked.push(item);
  }
  return picked;
}

function demoSets(weightFrom: number, weightTo: number): Array<{ weight: string; reps: string; done: true }> {
  return Array.from({ length: 3 }, () => ({
    weight: String(Math.round((weightFrom + Math.random() * (weightTo - weightFrom)) * 2) / 2),
    reps: String(8 + Math.floor(Math.random() * 5)),
    done: true as const,
  }));
}

function buildWorkout(spec: DemoSpec, exerciseNames: readonly string[]): GeneratedWorkout {
  return buildWorkoutFromEntries(
    spec.type,
    spec.volume,
    exerciseNames.map((name) => ({ slotKey: 's', exerciseName: name })),
  );
}

export function ensureDemoSeed(db: GymixDb): void {
  if (!import.meta.env.DEV || typeof localStorage === 'undefined') return;
  // Повторный вызов (StrictMode в dev) не должен задвоить сид.
  if (seeding === undefined) {
    seeding = doSeed(db).catch(() => {
      seeding = undefined;
    });
  }
}

let seeding: Promise<void> | undefined;

async function doSeed(db: GymixDb): Promise<void> {
  try {
    if (localStorage.getItem(DEMO_KEY) !== null) return;

    const completed = await db.pglite.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM workout_sessions WHERE status = 'completed'",
    );
    if ((completed.rows[0]?.n ?? 0) > 0) {
      localStorage.setItem(DEMO_KEY, '1');
      return;
    }

    const namesRes = await db.pglite.query<{ name: string }>(
      'SELECT canonical_name_ru::text AS name FROM exercises',
    );
    const pool = namesRes.rows.map((row) => row.name).filter(Boolean);

    const now = Date.now();
    const day = 86_400_000;
    for (const spec of DEMO_SPECS) {
      const workout = buildWorkout(spec, shuffleNames(pool, spec.exercises));
      const durationMs = spec.durationMin * 60_000;
      const endedAt = now - spec.daysAgo * day - Math.floor(Math.random() * 16) * 3_600_000;
      await saveSession(db, {
        workout,
        sets: workout.entries.map(() => demoSets(spec.weightFrom, spec.weightTo)),
        startedAt: endedAt - durationMs,
        endedAt,
        durationMs,
      });
    }
    localStorage.setItem(DEMO_KEY, '1');
  } catch {
    // Демо-заполнение не должно мешать работе приложения.
  }
}