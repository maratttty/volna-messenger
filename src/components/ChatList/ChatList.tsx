import { useState, useMemo, useEffect } from 'react';
import { ChatListItem } from './ChatListItem';
import { searchUsers, getOrCreateDirectChat } from '../../lib/chats';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import type { ChatWithMeta, Profile } from '../../types/database';

interface ChatListProps {
  chats: ChatWithMeta[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  loading: boolean;
  currentUserId: string;
}

export function ChatList({ chats, activeChatId, onSelect, loading, currentUserId }: ChatListProps) {
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState<Profile[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return chats;
    const q = query.toLowerCase();
    return chats.filter((c) => {
      const title = c.type === 'direct' ? c.otherUser?.display_name ?? '' : c.title ?? '';
      const username = c.type === 'direct' ? c.otherUser?.username ?? '' : '';
      return title.toLowerCase().includes(q) || username.toLowerCase().includes(q);
    });
  }, [chats, query]);

  // Beyond existing chats, also search the user directory by username so you
  // can start a brand-new conversation right from this same search box.
  useEffect(() => {
    if (query.trim().length < 2) {
      setUserResults([]);
      return;
    }
    setSearchingUsers(true);
    const t = setTimeout(async () => {
      try {
        const users = await searchUsers(query, currentUserId);
        const existingIds = new Set(chats.map((c) => c.otherUser?.id).filter(Boolean));
        setUserResults(users.filter((u) => !existingIds.has(u.id)));
      } finally {
        setSearchingUsers(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, currentUserId, chats]);

  async function handleStartChat(user: Profile) {
    setStartingChatWith(user.id);
    try {
      const chatId = await getOrCreateDirectChat(currentUserId, user.id);
      setQuery('');
      onSelect(chatId);
    } finally {
      setStartingChatWith(null);
    }
  }

  const showEmptyState = filtered.length === 0 && userResults.length === 0 && !searchingUsers;

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2">
        <input
          type="text"
          placeholder="Поиск чатов и пользователей"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-text-muted">Загрузка чатов…</div>
        ) : (
          <>
            {filtered.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                active={chat.id === activeChatId}
                onClick={() => onSelect(chat.id)}
              />
            ))}

            {searchingUsers && (
              <div className="flex justify-center py-3">
                <Spinner className="h-4 w-4" />
              </div>
            )}

            {userResults.length > 0 && (
              <div className="mt-1">
                <p className="px-4 py-1 text-xs font-medium text-text-muted">Пользователи</p>
                {userResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => void handleStartChat(user)}
                    disabled={startingChatWith !== null}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-hover disabled:opacity-50"
                  >
                    <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{user.display_name}</p>
                      <p className="truncate text-xs text-text-muted">@{user.username}</p>
                    </div>
                    {startingChatWith === user.id && <Spinner className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {showEmptyState && (
              <div className="px-4 py-6 text-center text-sm text-text-muted">
                {query ? 'Ничего не найдено' : 'Пока нет чатов'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
