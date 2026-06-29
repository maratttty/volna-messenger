import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createProfile, checkUsernameAvailable } from '../lib/auth';
import { APP_NAME } from '../config';
import { AuthLayout } from '../components/AuthLayout';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export default function SetupProfile() {
  const { session, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!username) { setUsernameError(null); return; }
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3–32 символа: строчные буквы, цифры, _');
      return;
    }
    setCheckingUsername(true);
    setUsernameError(null);
    const t = setTimeout(async () => {
      const available = await checkUsernameAvailable(username);
      setCheckingUsername(false);
      if (!available) setUsernameError('Имя пользователя уже занято');
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-text-muted">Загрузка…</div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to="/" replace />;

  // Capture into const so TypeScript narrows past the async boundary
  const currentSession = session;

  function handleUsernameChange(e: { target: { value: string } }) {
    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    if (usernameError || checkingUsername) return;
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3–32 символа: строчные буквы, цифры, _');
      return;
    }
    if (!displayName.trim()) {
      setError('Укажите отображаемое имя');
      return;
    }

    setBusy(true);
    try {
      await createProfile(currentSession.user.id, username, displayName);
      await refreshProfile();
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка создания профиля';
      setError(msg.includes('duplicate') ? 'Имя пользователя уже занято' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={`Добро пожаловать в ${APP_NAME}`}>
      <p className="mb-6 text-center text-sm text-text-muted">
        Последний шаг — выберите имя пользователя
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <div className="flex items-center rounded-lg border border-border bg-surface px-4 py-3 focus-within:border-accent">
            <span className="mr-1 text-text-muted">@</span>
            <input
              type="text"
              required
              placeholder="username"
              value={username}
              onChange={handleUsernameChange}
              maxLength={32}
              className="flex-1 bg-transparent outline-none"
            />
            {checkingUsername && (
              <span className="ml-2 text-xs text-text-muted">проверяем…</span>
            )}
          </div>
          {usernameError && (
            <p className="mt-1 text-xs text-red-400">{usernameError}</p>
          )}
        </div>
        <input
          type="text"
          required
          placeholder="Отображаемое имя"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={64}
          className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !!usernameError || checkingUsername}
          className="rounded-lg bg-accent px-4 py-3 font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Сохраняем…' : 'Готово'}
        </button>
      </form>
    </AuthLayout>
  );
}
