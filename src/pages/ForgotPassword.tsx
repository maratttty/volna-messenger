import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordReset } from '../lib/auth';
import { AuthLayout } from '../components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки письма');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Письмо отправлено">
        <p className="text-center text-sm text-text-muted">
          Проверьте почту <span className="text-text">{email}</span> — там ссылка для сброса пароля.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-accent hover:underline">
            Вернуться к входу
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Сброс пароля">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-3 font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Отправляем…' : 'Отправить ссылку'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-text-muted">
        <Link to="/login" className="text-accent hover:underline">
          Назад к входу
        </Link>
      </p>
    </AuthLayout>
  );
}
