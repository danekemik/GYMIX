import { z } from 'zod';
import { fileURLToPath } from 'node:url';

const DEV_SECRET = 'dev-only-secret-change-me-in-production-0000';

/**
 * Конфигурация из переменных окружения. `parseEnv` падает при старте,
 * если обязательные значения отсутствуют, чтобы не поднимать сервер,
 * который сломан на полпути.
 */

const booleanFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(defaultValue)
    .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://gymix:gymix@localhost:55432/gymix'),
  APP_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  MIGRATIONS_DIR: z.string().optional(),
  REFERENCE_DIR: z.string().optional(),
  APP_MIGRATE: booleanFromString('true'),
  APP_SEED: booleanFromString('true'),
  EMAIL_MODE: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: booleanFromString('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Gymix <no-reply@gymix.app>'),
  JWT_SECRET: z.string().min(32).default(DEV_SECRET),
  ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  JOB_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  TRUST_PROXY: booleanFromString('false'),
}).superRefine((config, ctx) => {
  if (config.NODE_ENV !== 'production') return;
  if (config.JWT_SECRET === DEV_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'В production требуется собственный JWT_SECRET' });
  }
  if (config.EMAIL_MODE !== 'smtp' || !config.SMTP_HOST) {
    ctx.addIssue({ code: 'custom', path: ['EMAIL_MODE'], message: 'В production требуется настроенный SMTP' });
  }
});

export type Config = z.infer<typeof envSchema>;

/**
 * Значения, производные от env, вынесены в отдельный тип, чтобы
 * остальные слои не знали про строки окружения.
 */
export interface AppConfig {
  env: Config['NODE_ENV'];
  port: number;
  databaseUrl: string;
  origins: readonly string[];
  migrationsDir: string | null;
  referenceDir: string | null;
  runMigrations: boolean;
  runSeed: boolean;
  emailMode: 'console' | 'smtp';
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string | null;
    pass: string | null;
  };
  mailFrom: string;
  jwtSecret: string;
  accessTtlMs: number;
  refreshTtlMs: number;
  jobIntervalMs: number;
  trustProxy: boolean;
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    origins: parsed.APP_ORIGINS,
    migrationsDir: parsed.MIGRATIONS_DIR ?? fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url)),
    referenceDir: parsed.REFERENCE_DIR ?? fileURLToPath(new URL('../../../reference', import.meta.url)),
    runMigrations: parsed.APP_MIGRATE,
    runSeed: parsed.APP_SEED,
    emailMode: parsed.EMAIL_MODE,
    smtp: {
      host: parsed.SMTP_HOST ?? '',
      port: parsed.SMTP_PORT,
      secure: parsed.SMTP_SECURE,
      user: parsed.SMTP_USER ?? null,
      pass: parsed.SMTP_PASS ?? null,
    },
    mailFrom: parsed.MAIL_FROM,
    jwtSecret: parsed.JWT_SECRET,
    accessTtlMs: parsed.ACCESS_TTL_MINUTES * 60_000,
    refreshTtlMs: parsed.REFRESH_TTL_DAYS * 86_400_000,
    jobIntervalMs: parsed.JOB_INTERVAL_MS,
    trustProxy: parsed.TRUST_PROXY,
  };
}
