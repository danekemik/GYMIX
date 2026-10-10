import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(env: 'development' | 'production' | 'test'): Logger {
  return pino({
    level: env === 'test' ? 'silent' : env === 'production' ? 'info' : 'debug',
    redact: {
      paths: [
        'req.headers.authorization',
        '*.headers.authorization',
        'password',
        '*.password',
        'refreshToken',
        '*.refreshToken',
      ],
      censor: '[redacted]',
    },
  });
}