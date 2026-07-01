import { useState, useEffect } from 'react';
import { BookUser, Link, UserPlus } from 'lucide-react';
import { searchUsers, getOrCreateDirectChat } from '../../lib/chats';
import type { Profile, ChatWithMeta } from '../../types/database';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';

interface ContactsPanelProps {
  chats: ChatWithMeta[];
  currentUserId: string;
  onOpenChat: (chatId: string) => void;
}

interface PhoneContact {
  name: string;
  tel: string;
}

// Contact Picker API is available only on Android Chrome (and a few other Android browsers).
// iOS Safari, desktop Chrome, Firefox — not supported.
function isContactPickerSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window
  );
}

async function pickFromPhone(): Promise<PhoneContact[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
  const result: PhoneContact[] = [];
  for (const c of contacts) {
    const name = (c.name as string[] | undefined)?.[0] ?? 'Без имени';
    for (const tel of (c.tel as string[] | undefined) ?? []) {
      result.push({ name, tel: tel.replace(/\s/g, '') });
    }
  }
  return result;
}

function shareOrCopy(text: string) {
  if (navigator.share) {
    void navigator.share({ title: 'Freeword', text, url: window.location.origin });
  } else {
    void navigator.clipboard.writeText(text);
  }
}

export function ContactsPanel({ chats, currentUserId, onOpenChat }: ContactsPanelProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [phoneContacts, setPhoneContacts] = useState<PhoneContact[]>([]);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);

  const canPickContacts = isContactPickerSupported();

  const existingContacts: Profile[] = chats
    .filter((c) => c.type === 'direct' && c.otherUser)
    .map((c) => c.otherUser!);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const users = await searchUsers(query, currentUserId);
        setSearchResults(users);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, currentUserId]);

  async function handlePickContacts() {
    setPicking(true);
    try {
      const picked = await pickFromPhone();
      setPhoneContacts(picked);
    } catch {
      // User cancelled or permission denied — silently ignore
    } finally {
      setPicking(false);
    }
  }

  async function handleOpen(userId: string) {
    setStarting(userId);
    try {
      const chatId = await getOrCreateDirectChat(currentUserId, userId);
      onOpenChat(chatId);
    } finally {
      setStarting(null);
    }
  }

  function handleInvite() {
    const inviteText = `Присоединяйся к Freeword — свободное общение: ${window.location.origin}`;
    shareOrCopy(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isSearchMode = query.trim().length >= 2;
  const listToShow = isSearchMode ? searchResults : existingContacts;

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          placeholder="Найти по @username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Phone contact picker — Android Chrome only */}
        {canPickContacts && !isSearchMode && (
          <div className="px-3 pb-2">
            <button
              onClick={() => void handlePickContacts()}
              disabled={picking}
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm font-medium text-text transition hover:bg-surface-hover disabled:opacity-50"
            >
              {picking ? <Spinner className="h-4 w-4 shrink-0" /> : <BookUser size={18} className="shrink-0 text-accent" />}
              <span>{picking ? 'Открываю контакты…' : 'Выбрать из контактов телефона'}</span>
            </button>
          </div>
        )}

        {/* Results from phone picker */}
        {phoneContacts.length > 0 && !isSearchMode && (
          <div className="mb-2">
            <p className="px-4 py-1 text-xs font-medium text-text-muted">Из телефонной книги</p>
            {phoneContacts.map((c, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{c.name}</p>
                  <p className="truncate text-xs text-text-muted">{c.tel}</p>
                </div>
                <button
                  onClick={handleInvite}
                  title="Пригласить в Freeword"
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-text-muted transition hover:border-accent hover:text-accent"
                >
                  Пригласить
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Existing Freeword contacts / search results */}
        {searching ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-4 w-4" />
          </div>
        ) : listToShow.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-muted">
            {isSearchMode ? 'Пользователи не найдены' : 'Нет контактов'}
          </p>
        ) : (
          <>
            {!isSearchMode && (
              <p className="px-4 py-1 text-xs font-medium text-text-muted">В Freeword</p>
            )}
            {listToShow.map((user) => (
              <button
                key={user.id}
                onClick={() => void handleOpen(user.id)}
                disabled={starting !== null}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-hover disabled:opacity-50"
              >
                <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{user.display_name}</p>
                  <p className="truncate text-xs text-text-muted">@{user.username}</p>
                </div>
                {starting === user.id && <Spinner className="h-4 w-4" />}
              </button>
            ))}
          </>
        )}

        {/* iOS / desktop: no Contact Picker — explain + invite link */}
        {!canPickContacts && !isSearchMode && (
          <div className="mx-3 mt-4 rounded-xl border border-border bg-surface-hover p-4 text-xs text-text-muted">
            <div className="mb-2 flex items-center gap-1.5 font-medium text-text">
              <UserPlus size={14} />
              <span>Добавить из телефонной книги</span>
            </div>
            Ваш браузер не поддерживает прямой доступ к контактам. Найдите человека через поиск по @username или пригласите по ссылке.
          </div>
        )}
      </div>

      {/* Invite button — always shown at bottom */}
      {!isSearchMode && (
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={handleInvite}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/20"
          >
            <Link size={15} />
            {copied ? 'Ссылка скопирована!' : 'Пригласить в Freeword'}
          </button>
        </div>
      )}
    </div>
  );
}
