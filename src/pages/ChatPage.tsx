import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, UsersRound, X, MessageSquare, Users, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useChats } from '../hooks/useChats';
import { useChatStore } from '../store/chat-store';
import { ChatList } from '../components/ChatList/ChatList';
import { ContactsPanel } from '../components/ChatList/ContactsPanel';
import { ChatView } from '../components/ChatView/ChatView';
import { NewGroupModal } from '../components/ChatList/NewGroupModal';
import { getNotificationPermission, isNotificationSupported, requestNotificationPermission } from '../lib/notifications';
import { InstallBanner } from '../components/ui/InstallBanner';
import { UpdateBanner } from '../components/ui/UpdateBanner';

type SidebarTab = 'chats' | 'contacts';

export default function ChatPage() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { chats, loading, isRefreshing, reload } = useChats();
  const { activeChatId, setActiveChatId } = useChatStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');
  const [query, setQuery] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [notifDismissed, setNotifDismissed] = useState(false);

  // Android/PWA hardware back button: when a chat is open on mobile,
  // push a fake history entry so "back" closes the chat instead of leaving the app.
  useEffect(() => {
    if (!activeChatId) return;
    history.pushState({ chatOpen: true }, '');

    function onPopState() {
      // Only intercept on narrow screens (mobile)
      if (window.innerWidth < 768) {
        setActiveChatId(null);
      }
    }
    window.addEventListener('popstate', onPopState, { once: true });
    return () => window.removeEventListener('popstate', onPopState);
  }, [activeChatId, setActiveChatId]);

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
  }

  const showNotifBanner =
    isNotificationSupported() && notifPermission === 'default' && !notifDismissed;

  const activeChat = chats.find((c) => c.id === activeChatId);
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);


  async function handleGroupCreated(chatId: string) {
    setShowNewGroup(false);
    await reload();
    setActiveChatId(chatId);
  }

  function handleOpenChat(chatId: string) {
    setActiveChatId(chatId);
    setActiveTab('chats');
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/*
        ── SIDEBAR ──────────────────────────────────────────────────────────
        Mobile  (< 768px):
          • No active chat  → w-full flex   (full-screen list)
          • Chat open       → hidden         (list slides away)
        Desktop (≥ 768px):
          • Always          → w-72 flex      (fixed sidebar alongside chat)
      */}
      <aside
        className={
          activeChatId
            // Mobile: hidden. Desktop: fixed 288px sidebar
            ? 'hidden md:flex md:w-72 md:shrink-0 flex-col border-r border-border bg-surface'
            // Mobile: full-screen list. Desktop: fixed 288px sidebar
            : 'flex w-full md:w-72 md:shrink-0 flex-col border-r border-border bg-surface'
        }
      >
        {/* Header */}
        <div className="border-b border-border px-4 pb-2 pt-3">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-bold text-text">
                {activeTab === 'chats' ? 'Чаты' : activeTab === 'contacts' ? 'Контакты' : 'Чаты'}
              </h1>
              {/* "обновление..." — only while background refresh is running */}
              {isRefreshing && activeTab === 'chats' && (
                <span className="text-[11px] text-text-muted animate-pulse">обновление…</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {activeTab === 'chats' && (
                <button
                  onClick={() => setShowNewGroup(true)}
                  title="Новая группа"
                  className="rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text"
                >
                  <UsersRound size={16} />
                </button>
              )}
              <button
                onClick={() => void signOut()}
                className="rounded-md px-2 py-1 text-xs text-text-muted transition hover:bg-surface-hover hover:text-text"
              >
                Выйти
              </button>
            </div>
          </div>
          {/* Search bar — under the title */}
          {(activeTab === 'chats' || activeTab === 'contacts') && (
            <div className="mt-2">
              <input
                type="text"
                placeholder="Поиск чатов и пользователей"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        <UpdateBanner />
        <InstallBanner />

        {showNotifBanner && (
          <div className="flex items-center gap-2 border-b border-border bg-surface-hover px-3 py-2 text-xs text-text">
            <Bell size={14} className="shrink-0 text-accent" />
            <span className="flex-1">Включить уведомления о новых сообщениях?</span>
            <button
              onClick={() => void handleEnableNotifications()}
              className="shrink-0 rounded-md bg-accent px-2 py-1 font-medium text-bg transition hover:bg-accent-hover"
            >
              Включить
            </button>
            <button
              onClick={() => setNotifDismissed(true)}
              className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface hover:text-text"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {session && activeTab === 'chats' && (
            <ChatList
              chats={chats}
              activeChatId={activeChatId}
              onSelect={setActiveChatId}
              loading={loading}
              currentUserId={session.user.id}
              query={query}
              onQueryChange={setQuery}
            />
          )}
          {session && activeTab === 'contacts' && (
            <ContactsPanel
              chats={chats}
              currentUserId={session.user.id}
              onOpenChat={handleOpenChat}
            />
          )}
        </div>

        {/* Bottom tab bar — pb-safe pads for iPhone home indicator */}
        <div className="pb-safe flex shrink-0 items-center border-t border-border bg-surface">
          {(
            [
              { id: 'chats',    Icon: MessageSquare, label: 'Чаты',     badge: totalUnread },
              { id: 'contacts', Icon: Users,         label: 'Контакты', badge: 0 },
            ] as { id: SidebarTab; Icon: typeof MessageSquare; label: string; badge: number }[]
          ).map(({ id, Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium transition ${
                activeTab === id ? 'text-accent' : 'text-text-muted hover:text-text'
              }`}
            >
              <div className="relative">
                <Icon size={20} />
                {badge > 0 && (
                  <span className="anim-pop absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span>{label}</span>
            </button>
          ))}
          <button
            onClick={() => navigate('/settings')}
            className="flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium text-text-muted transition hover:text-text"
          >
            <Settings size={20} />
            <span>Настройки</span>
          </button>
        </div>
      </aside>

      {/*
        ── MAIN AREA ────────────────────────────────────────────────────────
        Mobile  (< 768px):
          • No active chat  → not rendered   (sidebar fills screen)
          • Chat open       → full screen
        Desktop (≥ 768px):
          • No active chat  → "choose a chat" placeholder
          • Chat open       → fills remaining space next to sidebar
      */}
      {activeChat && session ? (
        <div key={activeChat.id} className="flex flex-1 flex-col md:anim-slide-right anim-slide-right overflow-hidden">
        <ChatView
          key={activeChat.id}
          chat={activeChat}
          chats={chats}
          currentUserId={session.user.id}
          currentUserDisplayName={profile?.display_name ?? ''}
          currentUserAvatarUrl={profile?.avatar_url ?? null}
          onBack={() => setActiveChatId(null)}
        />
        </div>
      ) : (
        // Desktop-only empty state; on mobile the sidebar is full-screen so this is never visible
        <main className="hidden md:flex md:flex-1 md:flex-col md:items-center md:justify-center text-text-muted">
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
