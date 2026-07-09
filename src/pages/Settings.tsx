import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, checkUsernameAvailable } from '../lib/auth';
import { uploadAttachment } from '../lib/storage';
import { isSoundEnabled, setSoundEnabled } from '../lib/sound';
import { Avatar } from '../components/ui/Avatar';
import { Spinner } from '../components/ui/Spinner';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export default function Settings() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [showLastSeen, setShowLastSeen] = useState(profile?.show_last_seen ?? true);
  const [togglingLastSeen, setTogglingLastSeen] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(isSoundEnabled());
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session || !profile) return null;

  function handleUsernameChange(e: ChangeEvent<HTMLInputElement>) {
    setSaved(false);
    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  }

  function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaved(false);
    setPendingAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function validateUsername(): Promise<boolean> {
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3–32 символа: строчные буквы, цифры, _');
      return false;
    }
    setCheckingUsername(true);
    const available = await checkUsernameAvailable(username, session!.user.id);
    setCheckingUsername(false);
    if (!available) {
      setUsernameError('Имя пользователя уже занято');
      return false;
    }
    setUsernameError(null);
    return true;
  }

  function handleToggleSounds() {
    const next = !soundsEnabled;
    setSoundsEnabled(next);
    setSoundEnabled(next);
  }

  async function handleToggleShowLastSeen() {
    const next = !showLastSeen;
    setShowLastSeen(next);
    setTogglingLastSeen(true);
    try {
      await updateProfile(session!.user.id, { showLastSeen: next });
      await refreshProfile();
    } catch {
      setShowLastSeen(!next);
    } finally {
      setTogglingLastSeen(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    if (!displayName.trim()) {
      setError('Укажите отображаемое имя');
      return;
    }
    if (!(await validateUsername())) return;

    setSaving(true);
    try {
      let avatarUrl = profile!.avatar_url ?? undefined;
      if (pendingAvatarFile) {
        const uploaded = await uploadAttachment('avatars', session!.user.id, pendingAvatarFile);
        avatarUrl = uploaded.url;
      }
      await updateProfile(session!.user.id, { displayName, username, bio, avatarUrl });
      await refreshProfile();
      setPendingAvatarFile(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-bg px-4 py-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-semibold text-text">Настройки профиля</h1>
        </div>

        <div className="mb-6 flex justify-center">
          <button onClick={() => fileInputRef.current?.click()} className="group relative">
            <Avatar name={displayName || profile.username} src={avatarPreview} size="lg" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
              <Camera size={18} className="text-white" />
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs text-text-muted">Отображаемое имя</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaved(false);
              }}
              maxLength={64}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-muted">Имя пользователя</label>
            <div className="flex items-center rounded-lg border border-border bg-surface px-4 py-3 focus-within:border-accent">
              <span className="mr-1 text-text-muted">@</span>
              <input
                type="text"
                value={username}
                onChange={handleUsernameChange}
                onBlur={() => void validateUsername()}
                maxLength={32}
                className="flex-1 bg-transparent outline-none"
              />
              {checkingUsername && <span className="ml-2 text-xs text-text-muted">проверяем…</span>}
            </div>
            {usernameError && <p className="mt-1 text-xs text-red-400">{usernameError}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-muted">О себе</label>
            <textarea
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setSaved(false);
              }}
              maxLength={200}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {saved && <p className="text-sm text-accent">Сохранено</p>}

          <button
            onClick={() => void handleSave()}
            disabled={saving || checkingUsername}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
          >
            {saving && <Spinner className="h-4 w-4" />}
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">Звуки</p>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">Звуки сообщений</p>
                <p className="mt-0.5 text-xs text-text-muted">Звук при отправке и получении сообщений</p>
              </div>
              <button
                onClick={handleToggleSounds}
                className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${soundsEnabled ? 'bg-accent' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${soundsEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">Приватность</p>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">Показывать время визита</p>
                <p className="mt-0.5 text-xs text-text-muted">Другие увидят, когда вы были в сети</p>
              </div>
              <button
                onClick={() => void handleToggleShowLastSeen()}
                disabled={togglingLastSeen}
                className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${showLastSeen ? 'bg-accent' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${showLastSeen ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <button
            onClick={() => void signOut()}
            className="rounded-lg px-4 py-2 text-sm text-text-muted transition hover:bg-surface-hover hover:text-text"
          >
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}
