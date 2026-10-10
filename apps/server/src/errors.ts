/**
 * Единый формат ошибок API.
 *
 * Внутри — исключение с HTTP-статусом и машиночитаемым кодом.
 * Снаружи (в ответе) — `{ error: { code, message } }`. Коды стабильны
 * и документированы, чтобы клиент мог ветвиться без разбора текста.
 */

export type ErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'invalid_code'
  | 'invalid_refresh'
  | 'requires_verification'
  | 'account_deleted'
  | 'email_taken'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'session_conflict'
  | 'ownership_required'
  | 'operation_rejected'
  | 'unknown_exercise'
  | 'rate_limited'
  | 'internal';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }

  static invalidRequest(message: string): HttpError {
    return new HttpError(400, 'invalid_request', message);
  }

  static unauthorized(message = 'Требуется вход'): HttpError {
    return new HttpError(401, 'unauthorized', message);
  }

  static notFound(message = 'Не найдено'): HttpError {
    return new HttpError(404, 'not_found', message);
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}