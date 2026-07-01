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
import { APP_NAME } from '../config';
import { getNotificationPermission, isNotificationSupported, requestNotificationPermission } from '../lib/notifications';
import { InstallBanner } from '../components/ui/InstallBanner';

type SidebarTab = 'chats' | 'contacts';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

export default function ChatPage() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { chats, loading, reload } = useChats();
  const { activeChatId, setActiveChatId } = useChatStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');
  const isMobile = useIsMobile();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [notifDismissed, setNotifDismissed] = useState(false);

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

  // On mobile: show sidebar when no chat selected, show chat fullscreen when chat selected.
  // On desktop: show both side-by-side always.
  const showSidebar = !isMobile || !activeChatId;
  const showChat = !!activeChat && !!session;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className={`${showSidebar ? 'flex' : 'hidden'} ${isMobile ? 'w-full' : 'w-72 shrink-0'} flex-col border-r border-border bg-surface`}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-semibold text-text">{APP_NAME}</span>
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
              title="Не сейчас"
              className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface hover:text-text"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {session && activeTab === 'chats' && (
            <ChatList
              chats={chats}
              activeChatId={activeChatId}
              onSelect={setActiveChatId}
              loading={loading}
              currentUserId={session.user.id}
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

        {/* Bottom tab bar — pb-safe adds padding for iPhone home indicator */}
        <div className="pb-safe flex items-center border-t border-border bg-surface">
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
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
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

      {/* Main content */}
      {showChat ? (
        <ChatView
          key={activeChat!.id}
          chat={activeChat!}
          chats={chats}
          currentUserId={session!.user.id}
          currentUserDisplayName={profile?.display_name ?? ''}
          onBack={isMobile ? () => setActiveChatId(null) : undefined}
        />
      ) : !isMobile ? (
        <main className="flex flex-1 flex-col items-center justify-center text-text-muted">
          <div className="text-center">
            <div className="mb-3 text-4xl">💬</div>
            <p className="text-lg font-medium text-text">Выберите чат</p>
            <p className="mt-1 text-sm">или начните новый разговор</p>
          </div>
        </main>
      ) : null}

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
