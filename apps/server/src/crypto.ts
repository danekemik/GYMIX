import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** Пароль хранится argon2id; параметры — рекомендуемые для Node-сервисов. */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch {
    return false;
  }
}

/** Секретная строка для токенов и кодов: 32 байта base64url. */
export function randomSecret(bits = 256): string {
  return randomBytes(bits / 8).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Хэш с солью для 6-значных кодов подтверждения. Код не хранится, только
 * HMAC от него — перебор по 10^6 вариантам бессмыслен без секрета.
 */
export function codeDigest(secret: string, purpose: string, email: string, code: string): string {
  return createHash('sha256')
    .update(`${secret}\u0000${purpose}\u0000${email.toLocaleLowerCase()}\u0000${code}`)
    .digest('hex');
}

/** Генерация кода подтверждения email: 6 цифр. */
export function generateEmailCode(): string {
  return randomInt(0, 1_000_000).toString(10).padStart(6, '0');
}

/**
 * Защищённое сравнение: обычное `===` утечка длины, цифровой код легко
 * перебирать, поэтому сравнение константное по времени.
 */
export function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return timingSafeEqual(ah, bh);
}