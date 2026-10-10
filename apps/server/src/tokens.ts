import { jwtVerify, SignJWT } from 'jose';
import { HttpError } from './errors.js';
import { randomSecret, sha256Hex } from './crypto.js';

/**
 * Access-токен — подписанный JWT (HS256), короткий (15 минут), хранится
 * только у клиента. Refresh-токен — непрозрачный (32 байта случайности);
 * в БД лежит только его SHA-256. Ротация: при каждом refresh старый
 * токен гасится (revokedAt), новый выдаётся с новым хэшем.
 */

export interface AccessClaims {
  userId: string;
  deviceId: string;
  sessionId: string;
}

export interface TokenService {
  signAccess(claims: AccessClaims): Promise<string>;
  verifyAccess(token: string): Promise<AccessClaims>;
  createRefreshToken(): { token: string; hash: string };
  hashRefreshToken(token: string): string;
}

const REFRESH_TOKEN_BYTES = 32;

export function createTokenService(
  secret: string,
  accessTtlMs: number,
  clock: () => Date,
): TokenService {
  const key = new TextEncoder().encode(secret);

  return {
    async signAccess({ userId, deviceId, sessionId }) {
      const issued = clock();
      return new SignJWT({ dev: deviceId, sid: sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuedAt(Math.floor(issued.getTime() / 1000))
        .setExpirationTime(Math.floor((issued.getTime() + accessTtlMs) / 1000))
        .sign(key);
    },

    async verifyAccess(token) {
      let payload;
      try {
        payload = await jwtVerify(token, key, { algorithms: ['HS256'] });
      } catch {
        throw HttpError.unauthorized('Сессия истекла, обновите вход');
      }
      const userId = payload.payload.sub;
      const deviceId = payload.payload.dev;
      const sessionId = payload.payload.sid;
      if (
        typeof userId !== 'string' ||
        typeof deviceId !== 'string' ||
        typeof sessionId !== 'string'
      ) {
        throw HttpError.unauthorized('Некорректный токен');
      }
      return { userId, deviceId, sessionId };
    },

    createRefreshToken() {
      const token = randomSecret(REFRESH_TOKEN_BYTES * 8);
      return { token, hash: sha256Hex(token) };
    },

    hashRefreshToken(token) {
      return sha256Hex(token);
    },
  };
}