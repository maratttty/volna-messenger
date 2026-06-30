import { BellOff, Bell } from 'lucide-react';
import type { ChatWithMeta } from '../../types/database';
import { Avatar } from '../ui/Avatar';
import { formatRelativeTime } from '../../lib/time';
import { setChatMuted } from '../../lib/chats';
import { useChatStore } from '../../store/chat-store';
import { useContextMenu } from '../../hooks/useContextMenu';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

function previewText(chat: ChatWithMeta): string {
  const msg = chat.lastMessage;
  if (!msg) return 'Нет сообщений';
  if (msg.deleted) return 'Сообщение удалено';
  switch (msg.type) {
    case 'image':
      return '📷 Фото';
    case 'file':
      return `📎 ${msg.attachment_meta?.name ?? 'Файл'}`;
    case 'system':
      return msg.content ?? '';
    default:
      return msg.content ?? '';
  }
}

function isOnline(lastSeenAt: string | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000; // 90s heartbeat window
}

interface ChatListItemProps {
  chat: ChatWithMeta;
  active: boolean;
  currentUserId: string;
  onClick: () => void;
}

export function ChatListItem({ chat, active, currentUserId, onClick }: ChatListItemProps) {
  const menu = useContextMenu();
  const title = chat.type === 'direct' ? chat.otherUser?.display_name ?? '...' : chat.title ?? 'Группа';
  const avatarSrc = chat.type === 'direct' ? chat.otherUser?.avatar_url : chat.avatar_url;
  const online = chat.type === 'direct' ? isOnline(chat.otherUser?.last_seen_at) : undefined;
  const time = chat.lastMessage?.created_at ?? chat.created_at;

  async function handleToggleMute() {
    const next = !chat.muted;
    useChatStore.getState().setMuted(chat.id, next);
    try {
      await setChatMuted(chat.id, currentUserId, next);
    } catch {
      useChatStore.getState().setMuted(chat.id, !next); // revert on failure
    }
  }

  const menuItems: ContextMenuItem[] = [
    chat.muted
      ? { label: 'Включить уведомления', icon: Bell, onClick: () => void handleToggleMute() }
      : { label: 'Отключить уведомления', icon: BellOff, onClick: () => void handleToggleMute() },
  ];

  return (
    <div className="relative">
      <button
        {...menu.triggerProps}
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
          active ? 'bg-surface-hover' : 'hover:bg-surface-hover'
        }`}
      >
        <Avatar name={title} src={avatarSrc} online={online} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 truncate text-sm font-medium text-text">
              <span className="truncate">{title}</span>
              {chat.muted && <BellOff size={12} className="shrink-0 text-text-muted" />}
            </p>
            <span className="shrink-0 text-xs text-text-muted">{formatRelativeTime(time)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-xs text-text-muted">{previewText(chat)}</p>
            {chat.unreadCount > 0 && (
              <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-bg">
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
      {menu.position && <ContextMenu x={menu.position.x} y={menu.position.y} items={menuItems} onClose={menu.close} />}
    </div>
  );
}
