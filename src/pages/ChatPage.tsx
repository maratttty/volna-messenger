import { useState } from 'react';
import { UsersRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useChats } from '../hooks/useChats';
import { useChatStore } from '../store/chat-store';
import { ChatList } from '../components/ChatList/ChatList';
import { ChatView } from '../components/ChatView/ChatView';
import { NewGroupModal } from '../components/ChatList/NewGroupModal';
import { Avatar } from '../components/ui/Avatar';
import { APP_NAME } from '../config';

export default function ChatPage() {
  const { session, profile, signOut } = useAuth();
  const { chats, loading, reload } = useChats();
  const { activeChatId, setActiveChatId } = useChatStore();
  const [showNewGroup, setShowNewGroup] = useState(false);

  const activeChat = chats.find((c) => c.id === activeChatId);

  async function handleGroupCreated(chatId: string) {
    setShowNewGroup(false);
    await reload();
    setActiveChatId(chatId);
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-semibold text-text">{APP_NAME}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewGroup(true)}
              title="Новая группа"
              className="rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text"
            >
              <UsersRound size={16} />
            </button>
            <button
              onClick={() => void signOut()}
              className="rounded-md px-2 py-1 text-xs text-text-muted transition hover:bg-surface-hover hover:text-text"
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {session && (
            <ChatList
              chats={chats}
              activeChatId={activeChatId}
              onSelect={setActiveChatId}
              loading={loading}
              currentUserId={session.user.id}
            />
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <Avatar name={profile?.display_name ?? ''} src={profile?.avatar_url} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{profile?.display_name}</p>
            <p className="truncate text-xs text-text-muted">@{profile?.username}</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      {activeChat && session ? (
        <ChatView
          key={activeChat.id}
          chat={activeChat}
          chats={chats}
          currentUserId={session.user.id}
          currentUserDisplayName={profile?.display_name ?? ''}
        />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center text-text-muted">
          <div className="text-center">
            <div className="mb-3 text-4xl">💬</div>
            <p className="text-lg font-medium text-text">Выберите чат</p>
            <p className="mt-1 text-sm">или начните новый разговор</p>
          </div>
        </main>
      )}

      {showNewGroup && session && (
        <NewGroupModal
          currentUserId={session.user.id}
          onCreated={(chatId) => void handleGroupCreated(chatId)}
          onClose={() => setShowNewGroup(false)}
        />
      )}
    </div>
  );
}
