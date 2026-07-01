import { useState } from 'react';
import { BellOff, Bell, Pin, PinOff, CheckCheck, BookOpen, Trash2, X } from 'lucide-react';
import type { ChatWithMeta } from '../../types/database';
import { Avatar } from '../ui/Avatar';
import { formatRelativeTime } from '../../lib/time';
import { setChatMuted, pinChat, unpinChat, markChatRead, markChatUnread, leaveAndDeleteChat } from '../../lib/chats';
import { useChatStore } from '../../store/chat-store';
import { useContextMenu } from '../../hooks/useContextMenu';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

function previewText(chat: ChatWithMeta): string {
  const msg = chat.lastMessage;
  if (!msg) return 'Нет сообщений';
  if (msg.deleted) return 'Сообщение удалено';
  switch (msg.type) {
    case 'image': return '📷 Фото';
    case 'file':  return `📎 ${msg.attachment_meta?.name ?? 'Файл'}`;
    case 'voice': return '🎤 Голосовое';
    case 'video_note': return '📹 Видео';
    case 'system': return msg.content ?? '';
    default: return msg.content ?? '';
  }
}

function isOnline(lastSeenAt: string | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000;
}

interface ChatListItemProps {
  chat: ChatWithMeta;
  active: boolean;
  currentUserId: string;
  onClick: () => void;
}

export function ChatListItem({ chat, active, currentUserId, onClick }: ChatListItemProps) {
  const menu = useContextMenu();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const title     = chat.type === 'direct' ? chat.otherUser?.display_name ?? '...' : chat.title ?? 'Группа';
  const avatarSrc = chat.type === 'direct' ? chat.otherUser?.avatar_url : chat.avatar_url;
  const online    = chat.type === 'direct' ? isOnline(chat.otherUser?.last_seen_at) : undefined;
  const time      = chat.lastMessage?.created_at ?? chat.created_at;
  const isPinned  = !!chat.pinned_at;

  async function handleToggleMute() {
    const next = !chat.muted;
    useChatStore.getState().setMuted(chat.id, next);
    try {
      await setChatMuted(chat.id, currentUserId, next);
    } catch {
      useChatStore.getState().setMuted(chat.id, !next);
    }
  }

  async function handleTogglePin() {
    const nextPinnedAt = isPinned ? null : new Date().toISOString();
    useChatStore.getState().setPinned(chat.id, nextPinnedAt);
    try {
      if (isPinned) await unpinChat(chat.id, currentUserId);
      else          await pinChat(chat.id, currentUserId);
    } catch {
      useChatStore.getState().setPinned(chat.id, chat.pinned_at);
    }
  }

  async function handleMarkRead() {
    useChatStore.getState().markRead(chat.id, chat.lastMessage?.id ?? '');
    try { await markChatRead(chat.id, currentUserId); } catch { /* ignore */ }
  }

  async function handleMarkUnread() {
    useChatStore.getState().setUnreadCount(chat.id, 1);
    try { await markChatUnread(chat.id, currentUserId); } catch { /* ignore */ }
  }

  async function handleDelete() {
    useChatStore.getState().removeChat(chat.id);
    const { activeChatId, setActiveChatId } = useChatStore.getState();
    if (activeChatId === chat.id) setActiveChatId(null);
    try { await leaveAndDeleteChat(chat.id, currentUserId); } catch { /* ignore — already removed locally */ }
  }

  // Haptic feedback on mobile long-press (best-effort — not all devices support it)
  function handleTriggerProps() {
    const base = menu.triggerProps;
    return {
      ...base,
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        base.onPointerDown(e);
        // Schedule haptic at the same moment the long-press fires
        setTimeout(() => {
          if ('vibrate' in navigator) navigator.vibrate(10);
        }, 450);
      },
    };
  }

  const menuItems: ContextMenuItem[] = [
    isPinned
      ? { label: 'Открепить',             icon: PinOff,    onClick: () => void handleTogglePin() }
      : { label: 'Закрепить',              icon: Pin,       onClick: () => void handleTogglePin() },
    chat.muted
      ? { label: 'Включить уведомления',   icon: Bell,      onClick: () => void handleToggleMute() }
      : { label: 'Отключить уведомления',  icon: BellOff,   onClick: () => void handleToggleMute() },
    chat.unreadCount > 0
      ? { label: 'Отметить прочитанным',   icon: CheckCheck, onClick: () => void handleMarkRead() }
      : { label: 'Отметить непрочитанным', icon: BookOpen,   onClick: () => void handleMarkUnread() },
    { label: 'В папку',   icon: Pin,     onClick: () => {}, disabled: true },
    { label: 'Удалить чат', icon: Trash2, onClick: () => setConfirmDelete(true), danger: true },
  ];

  return (
    <div className="relative">
      <button
        {...handleTriggerProps()}
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
          active ? 'bg-surface-hover' : 'hover:bg-surface-hover'
        }`}
      >
        <Avatar name={title} src={avatarSrc} online={online} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 truncate text-sm font-medium text-text">
              {isPinned && <Pin size={11} className="shrink-0 text-accent" />}
              <span className="truncate">{title}</span>
              {chat.muted && <BellOff size={12} className="shrink-0 text-text-muted" />}
            </p>
            <span className="shrink-0 text-xs text-text-muted">{formatRelativeTime(time)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-xs text-text-muted">{previewText(chat)}</p>
            {chat.unreadCount > 0 && (
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                chat.muted ? 'bg-text-muted/30 text-text-muted' : 'bg-accent text-bg'
              }`}>
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {menu.position && (
        <ContextMenu
          x={menu.position.x}
          y={menu.position.y}
          items={menuItems}
          onClose={menu.close}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="font-semibold text-text">Удалить чат?</p>
              <button onClick={() => setConfirmDelete(false)} className="rounded-md p-1 text-text-muted hover:bg-surface-hover">
                <X size={16} />
              </button>
            </div>
            <p className="mb-5 text-sm text-text-muted">
              Чат с <strong>{title}</strong> исчезнет из вашего списка. Другие участники его не потеряют.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-text transition hover:bg-surface-hover"
              >
                Отмена
              </button>
              <button
                onClick={() => { setConfirmDelete(false); void handleDelete(); }}
                className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
