import { parseConfig } from './env.js';
import { createLogger } from './logger.js';
import { connectDb } from './db.js';

async function main() {
  const config = parseConfig();
  const logger = createLogger(config.env);
  const connection = await connectDb(config, logger);
  await connection.close();
  logger.info('База готова: миграции применены, справочники загружены');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
