import { serve } from '@hono/node-server';
import { parseConfig } from './env.js';
import { createLogger } from './logger.js';
import { connectDb } from './db.js';
import { createTokenService } from './tokens.js';
import { createMailer } from './mailer.js';
import { createApp, type AppContext } from './app.js';
import { JobRunner } from './jobs.js';

async function main(): Promise<void> {
  const config = parseConfig();
  const logger = createLogger(config.env);
  const { db, close } = await connectDb(config, logger);
  const clock = (): Date => new Date();
  const tokens = createTokenService(config.jwtSecret, config.accessTtlMs, clock);
  const mailer = createMailer(config, logger);
  const ctx: AppContext = { config, logger, db, tokens, mailer, clock };

  const app = createApp(ctx);
  const jobs = new JobRunner(ctx);
  jobs.start(config.jobIntervalMs);

  const server = serve(
    { fetch: app.fetch, port: config.port },
    (info) => {
      logger.info({ port: info.port }, 'gymix server запущен');
    },
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'остановка сервера');
    jobs.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  // До создания логера старт может упасть быстрее — пишем в stderr.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});