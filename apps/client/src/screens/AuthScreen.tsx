import { useRef, useState, type FormEvent } from 'react';
import { ApiError, publicRequest, signIn, verifySignUp } from '../data/auth/api';
import { getSession } from '../data/auth/session';

type Mode = 'login' | 'register' | 'verify' | 'reset' | 'reset-confirm';
type Field = 'email' | 'password' | 'code' | undefined;

const TITLES: Record<Mode, string> = {
  login: 'Войти в GYMIX',
  register: 'Создать аккаунт',
  verify: 'Подтвердить почту',
  reset: 'Восстановить доступ',
  'reset-confirm': 'Новый пароль',
};

const DESCRIPTIONS: Record<Mode, string> = {
  login: 'Войдите, чтобы синхронизировать тренировки между устройствами. Без сети приложение продолжит работать.',
  register: 'Создайте аккаунт — тренировки и история будут доступны на всех устройствах.',
  verify: 'Введите 6-значный код из письма, чтобы подтвердить почту.',
  reset: 'Укажите почту аккаунта — пришлём код для сброса пароля.',
  'reset-confirm': 'Введите код из письма и придумайте новый пароль.',
};

export function AuthScreen({ reauthenticate = false, onCancel, onSuccess }: { reauthenticate?: boolean; onCancel?: () => void; onSuccess?: () => void; }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(getSession()?.user.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invalid, setInvalid] = useState<Field>(undefined);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const title = TITLES[mode];
  const needsPassword = mode === 'login' || mode === 'register' || mode === 'reset-confirm';
  const needsCode = mode === 'verify' || mode === 'reset-confirm';

  const changeMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setInvalid(undefined);
    setPassword('');
    setCode('');
    setShowPassword(false);
  };

  const fail = (message: string, field: Field) => {
    setError(message);
    setInvalid(field);
    if (field === 'email') emailRef.current?.focus();
    if (field === 'password') passwordRef.current?.focus();
    if (field === 'code') codeRef.current?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setInvalid(undefined);
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      fail('Проверь электронную почту — нужен адрес вида name@example.com.', 'email');
      return;
    }
    if (needsPassword && password.length < (mode === 'login' ? 1 : 8)) {
      fail('Пароль должен быть не короче 8 символов.', 'password');
      return;
    }
    if (needsCode && !/^\d{6}$/.test(code)) {
      fail('Код состоит из 6 цифр — проверь письмо.', 'code');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') { await signIn(normalized, password); onSuccess?.(); }
      if (mode === 'register') { await publicRequest('/auth/register', { email: normalized, password }); setMode('verify'); setPassword(''); setNotice('Код отправлен на почту.'); }
      if (mode === 'verify') { await verifySignUp(normalized, code); onSuccess?.(); }
      if (mode === 'reset') { await publicRequest('/auth/password/reset', { email: normalized }); setMode('reset-confirm'); setNotice('Код отправлен на почту.'); }
      if (mode === 'reset-confirm') { await publicRequest('/auth/password/reset/confirm', { email: normalized, code, newPassword: password }); setMode('login'); setPassword(''); setNotice('Пароль изменён. Войдите с новым паролем.'); }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'requires_verification') {
        setMode('verify');
        setNotice('Подтверди почту кодом из письма.');
      }
      setError(error instanceof ApiError ? error.message : 'Нет связи с сервером. Проверь интернет и повтори попытку.');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setError('');
    try {
      await publicRequest('/auth/resend-code', { email: email.trim().toLowerCase(), purpose: mode === 'verify' ? 'signup' : 'password_reset' });
      setNotice('Код отправлен. Проверь почту.');
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Не удалось отправить код. Проверь интернет.');
    } finally { setBusy(false); }
  };

  return (
    <section className="screen screen--auth">
      <header className="topbar"><h1 className="topbar__title">{title}</h1></header>
      <div className="screen__body">
        <p className="body-muted">
          {reauthenticate
            ? 'Локальные данные сохранены. Для отправки изменений войдите повторно.'
            : DESCRIPTIONS[mode]}
        </p>
        <form onSubmit={(event) => void submit(event)} className="auth-form" noValidate>
          <div className="field">
            <label className="field__label" htmlFor="auth-email">Электронная почта</label>
            <input
              ref={emailRef}
              id="auth-email"
              className="field__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value); if (invalid === 'email') setInvalid(undefined); }}
              aria-invalid={invalid === 'email' || undefined}
              aria-describedby={invalid === 'email' ? 'auth-error' : undefined}
              maxLength={254}
              readOnly={reauthenticate}
              required
            />
          </div>
          {needsCode && (
            <div className="field">
              <label className="field__label" htmlFor="auth-code">Код из письма</label>
              <input
                ref={codeRef}
                id="auth-code"
                className="field__input"
                value={code}
                onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); if (invalid === 'code') setInvalid(undefined); }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                aria-invalid={invalid === 'code' || undefined}
                aria-describedby={invalid === 'code' ? 'auth-error' : 'auth-code-hint'}
                required
              />
              <p className="body-muted" id="auth-code-hint">6 цифр. Код действует 15 минут.</p>
            </div>
          )}
          {needsPassword && (
            <div className="field">
              <div className="field__row">
                <label className="field__label" htmlFor="auth-password">{mode === 'reset-confirm' ? 'Новый пароль' : 'Пароль'}</label>
                <button
                  type="button"
                  className="text-action field__toggle"
                  aria-pressed={showPassword}
                  aria-controls="auth-password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? 'Скрыть' : 'Показать'}
                </button>
              </div>
              <input
                ref={passwordRef}
                id="auth-password"
                className="field__input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => { setPassword(event.target.value); if (invalid === 'password') setInvalid(undefined); }}
                aria-invalid={invalid === 'password' || undefined}
                aria-describedby={invalid === 'password' ? 'auth-error' : mode === 'login' ? undefined : 'auth-password-hint'}
                minLength={mode === 'login' ? 1 : 8}
                maxLength={200}
                required
              />
              {mode !== 'login' && <p className="body-muted" id="auth-password-hint">От 8 до 200 символов.</p>}
            </div>
          )}
          {error && <p className="body-error" id="auth-error" role="alert">{error}</p>}
          {notice && <p className="note" role="status">{notice}</p>}
          <button className="btn btn--primary" disabled={busy} type="submit">
            {busy ? 'Подождите…' : needsCode ? 'Подтвердить' : mode === 'register' ? 'Зарегистрироваться' : mode === 'reset' ? 'Отправить код' : 'Войти'}
          </button>
          {needsCode && <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => void resend()}>Отправить код повторно</button>}
          {mode === 'login' && (
            <div className="auth-alt">
              <button className="text-action" type="button" onClick={() => changeMode('reset')}>Забыли пароль?</button>
              <button className="btn btn--ghost" type="button" onClick={() => changeMode('register')}>Создать аккаунт</button>
            </div>
          )}
          {mode !== 'login' && <button className="text-action auth-alt__back" type="button" onClick={() => changeMode('login')}>Вернуться ко входу</button>}
          {onCancel && <button className="text-action auth-alt__back" type="button" onClick={onCancel}>Продолжить без синхронизации</button>}
        </form>
      </div>
    </section>
  );
}
