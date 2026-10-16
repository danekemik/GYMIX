import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AppConfig } from './env.js';
import type { Logger } from './logger.js';

/**
 * Доставка кодов подтверждения. Провайдер переключается переменной
 * EMAIL_MODE:
 *  - `console` — пишет код в лог (dev-режим; в production выводит
 *    предупреждение, чтобы сервер не ушёл в бой без почты);
 *  - `smtp` — настоящая отправка через SMTP.
 *
 * `sent` — журнал последних сообщений: тесты читают код из него,
 * в консольном режиме он же служит источником для разработки.
 */

export interface SentMessage {
  to: string;
  subject: string;
  text: string;
  code: string;
  purpose: 'signup' | 'password_reset';
  sentAt: Date;
}

export interface Mailer {
  sendCode(
    to: string,
    code: string,
    purpose: 'signup' | 'password_reset',
  ): Promise<void>;
  readonly sent: readonly SentMessage[];
}

const EMAIL_COOLDOWN_LABEL = {
  signup: 'подтверждения email',
  password_reset: 'восстановления пароля',
} as const;

export function createMailer(config: AppConfig, logger: Logger): Mailer {
  const sent: SentMessage[] = [];

  const configWarned = {
    smtp: false,
    dev: false,
  };

  if (config.emailMode === 'smtp' && (!config.smtp.host || !config.smtp.user)) {
    logger.warn('EMAIL_MODE=smtp, но SMTP_HOST/SMTP_USER не заданы; почта не уйдёт');
  }

  let transporter: Transporter | null = null;
  if (config.emailMode === 'smtp') {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.pass
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined,
    });
  }

  return {
    sent,

    async sendCode(to, code, purpose) {
      const subject = `Gymix: код ${EMAIL_COOLDOWN_LABEL[purpose]}`;
      const text = `Ваш код для Gymix: ${code}\n\nКод действует 15 минут.`;

      if (config.env !== 'production') {
        sent.push({ to, subject, text, code, purpose, sentAt: new Date() });
        if (sent.length > 100) sent.shift();
      }

      if (config.emailMode === 'console') {
        if (config.env === 'production' && !configWarned.dev) {
          configWarned.dev = true;
          logger.warn(
            'dev-режим почты включён в production: коды идут только в лог, отправки нет',
          );
        }
        logger.info({ to, purpose }, `код подтверждения: ${code}`);
        return;
      }

      if (!transporter) {
        throw new Error('SMTP не настроен, но EMAIL_MODE=smtp');
      }
      await transporter.sendMail({ from: config.mailFrom, to, subject, text });
    },
  };
}
