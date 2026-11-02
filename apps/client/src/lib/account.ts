import { getSession } from '../data/auth/session';
/**
 * Имя пользователя из аккаунта. Появляется после регистрации (её ещё нет в
 * клиенте), поэтому до этого момента имя считается незаданным и шапка
 * показывает нейтральное приветствие. Регистрация запишет значение через
 * `setUserName`, а синхронизация позже заменит локальное значение аккаунтным.
 */
const nameKey = () => `gymix:user-name:${getSession()?.user.id ?? 'signed-out'}`;

/** Имя текущего пользователя или `undefined`, если оно ещё не задано. */
export function getUserName(): string | undefined {
  try {
    const value = localStorage.getItem(nameKey());
    return value !== null && value.trim() !== '' ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Сохранить имя, введённое пользователем при регистрации. */
export function setUserName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed === '') localStorage.removeItem(nameKey());
    else localStorage.setItem(nameKey(), trimmed);
  } catch {
    // localStorage может быть недоступен (приватный режим) — молча пропускаем.
  }
}
