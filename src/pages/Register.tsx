import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signUp } from '../lib/auth';
import { APP_NAME } from '../config';
import { AuthLayout } from '../components/AuthLayout';

export default function Register() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!loading && session) return <Navigate to={from ?? '/'} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов');
      return;
    }

    setBusy(true);
    try {
      await signUp(email, password);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка регистрации';
      setError(msg === 'User already registered' ? 'Этот email уже зарегистрирован' : msg);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Проверьте почту">
        <p className="text-center text-sm text-text-muted">
          Мы отправили письмо на <span className="text-text">{email}</span>. Перейдите по ссылке в
          письме, чтобы подтвердить аккаунт и затем войти.
        </p>
        <p className="mt-4 text-center text-sm text-text-muted">
          <Link to="/login" state={{ from }} className="text-accent hover:underline">
            Вернуться к входу
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={`Регистрация в ${APP_NAME}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <input
          type="password"
          required
          placeholder="Пароль (мин. 8 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <input
          type="password"
          required
          placeholder="Повторите пароль"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-3 font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-text-muted">
        Уже есть аккаунт?{' '}
        <Link to="/login" state={{ from }} className="text-accent hover:underline">
          Войти
        </Link>
      </p>
    </AuthLayout>
  );
}
