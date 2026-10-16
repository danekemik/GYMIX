import { useState, type FormEvent } from 'react';
import { ApiError, publicRequest, signIn, verifySignUp } from '../data/auth/api';
import { getSession } from '../data/auth/session';

type Mode = 'login' | 'register' | 'verify' | 'reset' | 'reset-confirm';
export function AuthScreen({ reauthenticate = false, onCancel, onSuccess }: { reauthenticate?: boolean; onCancel?: () => void; onSuccess?: () => void; }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(getSession()?.user.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const title = { login: 'Войти в GYMIX', register: 'Создать аккаунт', verify: 'Подтвердить почту', reset: 'Восстановить доступ', 'reset-confirm': 'Новый пароль' }[mode];
  const changeMode = (next: Mode) => { setMode(next); setError(''); setNotice(''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const normalized = email.trim().toLowerCase();
      if (mode === 'login') { await signIn(normalized, password); onSuccess?.(); }
      if (mode === 'register') { await publicRequest('/auth/register', { email: normalized, password }); setMode('verify'); setPassword(''); }
      if (mode === 'verify') { await verifySignUp(normalized, code); onSuccess?.(); }
      if (mode === 'reset') { await publicRequest('/auth/password/reset', { email: normalized }); setMode('reset-confirm'); }
      if (mode === 'reset-confirm') { await publicRequest('/auth/password/reset/confirm', { email: normalized, code, newPassword: password }); setMode('login'); setPassword(''); setNotice('Пароль изменён. Войдите с новым паролем.'); }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'requires_verification') setMode('verify');
      setError(error instanceof ApiError ? error.message : 'Нет связи с сервером. Проверьте интернет и повторите попытку.');
    } finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError('');
    try { await publicRequest('/auth/resend-code', { email: email.trim().toLowerCase(), purpose: mode === 'verify' ? 'signup' : 'password_reset' }); setNotice('Код отправлен. Проверьте почту.'); }
    catch (error) { setError(error instanceof ApiError ? error.message : 'Не удалось отправить код. Проверьте интернет.'); }
    finally { setBusy(false); }
  };
  const needsPassword = mode === 'login' || mode === 'register' || mode === 'reset-confirm';
  const needsCode = mode === 'verify' || mode === 'reset-confirm';
  return <section className="screen"><header className="topbar"><h1 className="topbar__title">{title}</h1></header>
    <div className="screen__body">
      <p className="body-muted">{reauthenticate ? 'Локальные данные сохранены. Для отправки изменений войдите повторно.' : 'Войдите один раз с интернетом. Затем тренировки, история и шаблоны будут доступны без сети.'}</p>
      <form onSubmit={(event) => void submit(event)} className="auth-form">
        <div className="field"><label className="field__label" htmlFor="auth-email">Электронная почта</label>
          <input id="auth-email" className="field__input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} readOnly={reauthenticate} /></div>
        {needsCode && <div className="field"><label className="field__label" htmlFor="auth-code">Код из письма</label><input id="auth-code" className="field__input" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /><p className="body-muted">6 цифр. Код действует 15 минут.</p></div>}
        {needsPassword && <div className="field"><label className="field__label" htmlFor="auth-password">{mode === 'reset-confirm' ? 'Новый пароль' : 'Пароль'}</label><input id="auth-password" className="field__input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'login' ? 1 : 8} maxLength={200} required />{mode !== 'login' && <p className="body-muted">От 8 до 200 символов.</p>}</div>}
        {error && <p className="body-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <button className="btn btn--primary" disabled={busy} type="submit">{busy ? 'Подождите…' : needsCode ? 'Подтвердить' : mode === 'register' ? 'Зарегистрироваться' : mode === 'reset' ? 'Отправить код' : 'Войти'}</button>
        {needsCode && <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => void resend()}>Отправить код повторно</button>}
        {mode === 'login' && <><button className="btn btn--ghost" type="button" onClick={() => changeMode('register')}>Создать аккаунт</button><button className="btn btn--ghost" type="button" onClick={() => changeMode('reset')}>Забыли пароль?</button></>}
        {mode !== 'login' && <button className="btn btn--ghost" type="button" onClick={() => changeMode('login')}>Вернуться ко входу</button>}
        {onCancel && <button className="btn btn--ghost" type="button" onClick={onCancel}>Продолжить без синхронизации</button>}
      </form>
    </div>
  </section>;
}
