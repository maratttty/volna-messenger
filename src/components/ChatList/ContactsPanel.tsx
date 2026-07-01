import { useState, useEffect } from 'react';
import { searchUsers, getOrCreateDirectChat } from '../../lib/chats';
import type { Profile, ChatWithMeta } from '../../types/database';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';

interface ContactsPanelProps {
  chats: ChatWithMeta[];
  currentUserId: string;
  onOpenChat: (chatId: string) => void;
}

export function ContactsPanel({ chats, currentUserId, onOpenChat }: ContactsPanelProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

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

  async function handleOpen(userId: string) {
    setStarting(userId);
    try {
      const chatId = await getOrCreateDirectChat(currentUserId, userId);
      onOpenChat(chatId);
    } finally {
      setStarting(null);
    }
  }

  const isSearching = query.trim().length >= 2;
  const displayList = isSearching ? searchResults : existingContacts;
  const emptyText = isSearching ? 'Пользователи не найдены' : 'Нет контактов — найдите людей через поиск';

  return (
    <div className="flex h-full flex-col">
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
        {searching ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-4 w-4" />
          </div>
        ) : displayList.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-muted">{emptyText}</p>
        ) : (
          <>
            {!isSearching && (
              <p className="px-4 py-1 text-xs font-medium text-text-muted">Контакты</p>
            )}
            {displayList.map((user) => (
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
      </div>
    </div>
  );
}
