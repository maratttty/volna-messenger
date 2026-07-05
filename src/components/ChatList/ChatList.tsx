import { useMemo, useEffect, useState } from 'react';
import { ChatListItem, DeleteConfirmModal, type DeleteConfig } from './ChatListItem';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { searchUsers, getOrCreateDirectChat } from '../../lib/chats';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import type { ChatWithMeta, Profile } from '../../types/database';

// Shimmer skeleton row shown when there is no cached data yet (first visit).
function SkeletonRow({ delay }: { delay: number }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="h-10 w-10 shrink-0 rounded-full bg-surface-hover animate-pulse" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-3 w-3/4 rounded-full bg-surface-hover animate-pulse" />
        <div className="h-2.5 w-1/2 rounded-full bg-surface-hover animate-pulse" />
      </div>
      <div className="h-2 w-8 rounded-full bg-surface-hover animate-pulse" />
    </div>
  );
}

interface ChatListProps {
  chats: ChatWithMeta[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  /** True only when NO cache exists — shows skeletons */
  loading: boolean;
  currentUserId: string;
  query: string;
  onQueryChange: (q: string) => void;
}

export function ChatList({
  chats,
  activeChatId,
  onSelect,
  loading,
  currentUserId,
  query,
  onQueryChange,
}: ChatListProps) {
  const [userResults, setUserResults] = useState<Profile[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  const [chatMenu, setChatMenu] = useState<{
    anchorRect: DOMRect;
    items: ContextMenuItem[];
    close: () => void;
  } | null>(null);
  const [chatDelete, setChatDelete] = useState<DeleteConfig | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return chats;
    const q = query.toLowerCase();
    return chats.filter((c) => {
      const title    = c.type === 'direct' ? c.otherUser?.display_name ?? '' : c.title ?? '';
      const username = c.type === 'direct' ? c.otherUser?.username ?? '' : '';
      return title.toLowerCase().includes(q) || username.toLowerCase().includes(q);
    });
  }, [chats, query]);

  useEffect(() => {
    if (query.trim().length < 2) { setUserResults([]); return; }
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
      onQueryChange('');
      onSelect(chatId);
    } finally {
      setStartingChatWith(null);
    }
  }

  const showEmptyState = filtered.length === 0 && userResults.length === 0 && !searchingUsers;

  // First visit, no cache — show skeletons
  if (loading && chats.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} delay={i * 40} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
    <div className="flex-1 overflow-y-auto">
      {filtered.map((chat, idx) => (
        <div
          key={chat.id}
          className="anim-slide-up"
          style={{ animationDelay: `${Math.min(idx, 10) * 20}ms` }}
        >
          <ChatListItem
            chat={chat}
            active={chat.id === activeChatId}
            currentUserId={currentUserId}
            onClick={() => onSelect(chat.id)}
            onContextMenuOpen={(anchorRect, items, close) =>
              setChatMenu({ anchorRect, items, close })
            }
            onDeleteOpen={(config) => setChatDelete(config)}
          />
        </div>
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
    </div>
    {chatMenu && (
      <ContextMenu
        anchorRect={chatMenu.anchorRect}
        items={chatMenu.items}
        onClose={() => { chatMenu.close(); setChatMenu(null); }}
      />
    )}
    {chatDelete && (
      <DeleteConfirmModal
        variant={chatDelete.variant}
        onClose={() => setChatDelete(null)}
        onDeleteForMe={() => { setChatDelete(null); chatDelete.onDeleteForMe(); }}
        onDeleteForAll={() => { setChatDelete(null); chatDelete.onDeleteForAll(); }}
        onLeave={() => { setChatDelete(null); chatDelete.onLeave(); }}
        onDeleteGroup={() => { setChatDelete(null); chatDelete.onDeleteGroup(); }}
      />
    )}
    </div>
  );
}
