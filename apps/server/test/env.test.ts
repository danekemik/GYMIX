import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/env.js';

describe('конфигурация запуска', () => {
  it('даёт рабочие пути к миграциям и справочникам без ручных env', () => {
    const config = parseConfig({ NODE_ENV: 'development' });
    expect(config.migrationsDir).toMatch(/packages\/db\/drizzle$/);
    expect(config.referenceDir).toMatch(/reference$/);
  });
  it('не запускает production с dev-секретом или без почты', () => {
    expect(() => parseConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => parseConfig({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48) })).toThrow();
    expect(parseConfig({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48), EMAIL_MODE: 'smtp', SMTP_HOST: 'smtp.example.com' }).env).toBe('production');
  });
});
