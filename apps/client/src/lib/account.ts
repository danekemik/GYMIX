/**
 * Имя пользователя из аккаунта. Появляется после регистрации (её ещё нет в
 * клиенте), поэтому до этого момента имя считается незаданным и шапка
 * показывает нейтральное приветствие. Регистрация запишет значение через
 * `setUserName`, а синхронизация позже заменит локальное значение аккаунтным.
 */
const USER_NAME_KEY = 'gymix:user-name';

/** Имя текущего пользователя или `undefined`, если оно ещё не задано. */
export function getUserName(): string | undefined {
  try {
    const value = localStorage.getItem(USER_NAME_KEY);
    return value !== null && value.trim() !== '' ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Сохранить имя, введённое пользователем при регистрации. */
export function setUserName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed === '') localStorage.removeItem(USER_NAME_KEY);
    else localStorage.setItem(USER_NAME_KEY, trimmed);
  } catch {
    // localStorage может быть недоступен (приватный режим) — молча пропускаем.
  }
}
