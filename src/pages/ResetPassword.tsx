import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout } from '../components/AuthLayout';

export default function ResetPassword() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthLayout title="Пароль изменён">
        <p className="mb-6 text-center text-sm text-text-muted">Теперь можно войти с новым паролем.</p>
        <button
          onClick={() => navigate('/')}
          className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-bg transition hover:bg-accent-hover"
        >
          Перейти в приложение
        </button>
      </AuthLayout>
    );
  }

  // The recovery link from the email establishes a temporary session via the
  // URL hash — if it's missing or expired, there's nothing valid to act on.
  if (!loading && !session) {
    return (
      <AuthLayout title="Ссылка недействительна">
        <p className="text-center text-sm text-text-muted">
          Эта ссылка для сброса пароля больше не работает — запросите новую на странице входа.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Новый пароль">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          required
          placeholder="Новый пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <input
          type="password"
          required
          placeholder="Повторите пароль"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || loading}
          className="rounded-lg bg-accent px-4 py-3 font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Сохраняем…' : 'Сохранить пароль'}
        </button>
      </form>
    </AuthLayout>
  );
}
