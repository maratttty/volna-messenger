import { useEffect, useRef } from 'react';
import { BellOff, Bell, Pin, PinOff, Check, CheckCheck, BookOpen, Trash2, X, LogOut } from 'lucide-react';
import type { ChatWithMeta } from '../../types/database';
import { Avatar } from '../ui/Avatar';
import { formatRelativeTime } from '../../lib/time';
import {
  setChatMuted, pinChat, unpinChat, markChatRead, markChatUnread,
  leaveAndDeleteChat, deleteDirectChatForAll, deleteGroupChat,
} from '../../lib/chats';
import { useChatStore } from '../../store/chat-store';
import { useContextMenu } from '../../hooks/useContextMenu';
import { type ContextMenuItem } from '../ui/ContextMenu';

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
  onContextMenuOpen: (anchorRect: DOMRect, items: ContextMenuItem[], close: () => void) => void;
  onDeleteOpen: (config: DeleteConfig) => void;
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

export type DeleteVariant =
  | { kind: 'direct'; title: string }
  | { kind: 'group_member'; title: string }
  | { kind: 'group_owner'; title: string };

export interface DeleteConfig {
  variant: DeleteVariant;
  onDeleteForMe: () => void;
  onDeleteForAll: () => void;
  onLeave: () => void;
  onDeleteGroup: () => void;
}

export function DeleteConfirmModal({
  variant,
  onClose,
  onDeleteForMe,
  onDeleteForAll,
  onLeave,
  onDeleteGroup,
}: {
  variant: DeleteVariant;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForAll: () => void;
  onLeave: () => void;
  onDeleteGroup: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pb-safe"
      onClick={onClose}
    >
      <div
        className="mx-4 mb-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl sm:mb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="font-semibold text-text">
            {variant.kind === 'group_member' ? 'Выйти из группы?' : 'Удалить чат?'}
          </p>
          <button onClick={onClose} className="rounded-md p-1 text-text-muted hover:bg-surface-hover">
            <X size={16} />
          </button>
        </div>

        {variant.kind === 'direct' && (
          <>
            <p className="mb-4 text-sm text-text-muted">
              Удалить переписку с <strong>{variant.title}</strong>?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onDeleteForAll}
                className="w-full rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white transition hover:bg-red-600"
              >
                Удалить у всех
              </button>
              <button
                onClick={onDeleteForMe}
                className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-text transition hover:bg-surface-hover"
              >
                Удалить у себя
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl py-2 text-sm text-text-muted transition hover:bg-surface-hover"
              >
                Отмена
              </button>
            </div>
          </>
        )}

        {variant.kind === 'group_member' && (
          <>
            <p className="mb-4 text-sm text-text-muted">
              Вы покинете <strong>{variant.title}</strong>. Сообщения останутся у остальных участников.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-text transition hover:bg-surface-hover"
              >
                Отмена
              </button>
              <button
                onClick={onLeave}
                className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                Выйти
              </button>
            </div>
          </>
        )}

        {variant.kind === 'group_owner' && (
          <>
            <p className="mb-4 text-sm text-text-muted">
              Вы владелец группы <strong>{variant.title}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onDeleteGroup}
                className="w-full rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white transition hover:bg-red-600"
              >
                Удалить группу для всех
              </button>
              <button
                onClick={onLeave}
                className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-text transition hover:bg-surface-hover"
              >
                Выйти из группы
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl py-2 text-sm text-text-muted transition hover:bg-surface-hover"
              >
                Отмена
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ChatListItem({ chat, active, currentUserId, onClick, onContextMenuOpen, onDeleteOpen }: ChatListItemProps) {
  const menu = useContextMenu();

  const title     = chat.type === 'direct' ? chat.otherUser?.display_name ?? '...' : chat.title ?? 'Группа';
  const avatarSrc = chat.type === 'direct' ? chat.otherUser?.avatar_url : chat.avatar_url;
  const online    = chat.type === 'direct' && chat.otherUser?.show_last_seen !== false
    ? isOnline(chat.otherUser?.last_seen_at)
    : undefined;
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

  function removeChatLocally() {
    useChatStore.getState().removeChat(chat.id);
    const { activeChatId, setActiveChatId } = useChatStore.getState();
    if (activeChatId === chat.id) setActiveChatId(null);
  }

  async function handleDeleteForMe() {
    removeChatLocally();
    try { await leaveAndDeleteChat(chat.id, currentUserId); } catch { /* ignore */ }
  }

  async function handleDeleteForAll() {
    removeChatLocally();
    try { await deleteDirectChatForAll(chat.id); } catch { /* ignore */ }
  }

  async function handleLeaveGroup() {
    removeChatLocally();
    try { await leaveAndDeleteChat(chat.id, currentUserId); } catch { /* ignore */ }
  }

  async function handleDeleteGroup() {
    removeChatLocally();
    try { await deleteGroupChat(chat.id); } catch { /* ignore */ }
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
    chat.type === 'group'
      ? { label: chat.myRole === 'owner' ? 'Выйти / удалить группу' : 'Выйти из группы', icon: LogOut, onClick: () => onDeleteOpen({ variant: deleteVariant, onDeleteForMe: () => void handleDeleteForMe(), onDeleteForAll: () => void handleDeleteForAll(), onLeave: () => void handleLeaveGroup(), onDeleteGroup: () => void handleDeleteGroup() }), danger: true as const }
      : { label: 'Удалить чат',            icon: Trash2,    onClick: () => onDeleteOpen({ variant: deleteVariant, onDeleteForMe: () => void handleDeleteForMe(), onDeleteForAll: () => void handleDeleteForAll(), onLeave: () => void handleLeaveGroup(), onDeleteGroup: () => void handleDeleteGroup() }), danger: true as const },
  ];

  // Notify parent (ChatList) when the context menu should open or close.
  // Using refs so the effect only re-runs when position changes, not on every render.
  const menuItemsRef = useRef(menuItems);
  menuItemsRef.current = menuItems;
  const onContextMenuOpenRef = useRef(onContextMenuOpen);
  onContextMenuOpenRef.current = onContextMenuOpen;

  useEffect(() => {
    if (!menu.position) return;
    const anchorRect = {
      left: menu.position.x, right: menu.position.x,
      top: menu.position.y, bottom: menu.position.y,
      width: 0, height: 0, x: menu.position.x, y: menu.position.y,
      toJSON() { return this; },
    } as DOMRect;
    onContextMenuOpenRef.current(anchorRect, menuItemsRef.current, menu.close);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.position]);

  const deleteVariant: DeleteVariant = chat.type === 'direct'
    ? { kind: 'direct', title }
    : chat.myRole === 'owner'
      ? { kind: 'group_owner', title }
      : { kind: 'group_member', title };

  return (
    <div className="relative">
      <button
        {...menu.triggerProps}
        onPointerDown={(e) => {
          menu.triggerProps.onPointerDown(e);
          setTimeout(() => { if ('vibrate' in navigator) navigator.vibrate(10); }, 450);
        }}
        onClick={() => { if (menu.position) return; onClick(); }}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.98] active:bg-surface-hover ${
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
            <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-muted">
              {chat.lastMessage?.sender_id === currentUserId && (
                chat.lastMessageReadByOther
                  ? <CheckCheck size={13} className="text-accent" />
                  : <Check size={13} className="opacity-60" />
              )}
              {formatRelativeTime(time)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-xs text-text-muted">{previewText(chat)}</p>
            {chat.unreadCount > 0 && (
              <span className={`anim-pop shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                chat.muted ? 'bg-text-muted/30 text-text-muted' : 'bg-accent text-bg'
              }`}>
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

    </div>
  );
}
