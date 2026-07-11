import { useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, MoreHorizontal, Copy, Check, Bell, BellOff, Ban, UserCheck } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import type { Profile } from '../../types/database';
import { getOrCreateDirectChat, setChatMuted, blockUser, unblockUser } from '../../lib/chats';
import { formatLastSeen } from '../../lib/time';
import { useChatStore } from '../../store/chat-store';
import { useBlockStatus } from '../../hooks/useBlockStatus';

interface UserProfilePanelProps {
  profile: Profile;
  currentUserId: string;
  // Set when `profile` is the partner of an existing direct chat — enables
  // the mute toggle in the "Ещё" menu for that chat. There's no per-user
  // mute, only per-chat, so muting isn't available until a chat exists.
  directChatId?: string;
  directChatMuted?: boolean;
  onClose: () => void;
}

function isOnline(lastSeenAt: string | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000;
}

export function UserProfilePanel({ profile, currentUserId, directChatId, directChatMuted, onClose }: UserProfilePanelProps) {
  const [starting, setStarting] = useState(false);
  const [muted, setMutedLocal] = useState(directChatMuted ?? false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const isSelf = profile.id === currentUserId;
  const { blockedByMe, refresh: refreshBlockStatus } = useBlockStatus(currentUserId, isSelf ? undefined : profile.id);
  const online = profile.show_last_seen !== false && isOnline(profile.last_seen_at);
  const statusText = online
    ? 'в сети'
    : profile.show_last_seen === false
      ? 'не в сети'
      : `был(а) в сети ${formatLastSeen(profile.last_seen_at) ?? 'недавно'}`;

  async function handleOpenChat() {
    setStarting(true);
    setError(null);
    try {
      const chatId = await getOrCreateDirectChat(currentUserId, profile.id);
      useChatStore.getState().setActiveChatId(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть чат');
      setStarting(false);
    }
  }

  async function handleToggleMute() {
    if (!directChatId) return;
    const next = !muted;
    setMutedLocal(next);
    useChatStore.getState().setMuted(directChatId, next);
    try {
      await setChatMuted(directChatId, currentUserId, next);
    } catch {
      setMutedLocal(!next);
      useChatStore.getState().setMuted(directChatId, !next);
    }
  }

  async function handleCopyUsername() {
    await navigator.clipboard.writeText(profile.username);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleToggleBlock() {
    setError(null);
    try {
      if (blockedByMe) await unblockUser(currentUserId, profile.id);
      else await blockUser(currentUserId, profile.id);
      await refreshBlockStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить блокировку');
    }
  }

  // Mute only makes sense once a direct chat exists (there's no per-user
  // mute, only per-chat). Block/unblock works regardless — it's a relation
  // between the two users, not tied to a chat.
  const menuItems: ContextMenuItem[] = [
    ...(directChatId
      ? [
          {
            label: muted ? 'Включить звук' : 'Выключить звук',
            icon: muted ? Bell : BellOff,
            onClick: () => void handleToggleMute(),
          },
        ]
      : []),
    {
      label: blockedByMe ? 'Разблокировать' : 'Заблокировать',
      icon: blockedByMe ? UserCheck : Ban,
      danger: !blockedByMe,
      onClick: () => void handleToggleBlock(),
    },
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'auto' }}
      className="flex flex-col bg-bg anim-slide-right"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 py-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-hover hover:text-text"
        >
          <ArrowLeft size={20} />
        </button>
        <p className="text-sm font-medium text-text">Информация</p>
        {/* Right-side spacer keeps the title centered — "Изменить" isn't
            wired up yet (needs a migration, see chat), so there's nothing
            real to put here. */}
        <div className="h-9 w-9" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-1 px-4 pb-5 pt-6">
          <Avatar name={profile.display_name} src={profile.avatar_url} size="xl" online={online} />
          <p className="mt-3 text-xl font-semibold text-text">{profile.display_name}</p>
          <p className="text-sm text-text-muted">{statusText}</p>
        </div>

        {!isSelf && (
          <div className="flex gap-3 px-4 pb-4">
            <button
              onClick={() => void handleOpenChat()}
              disabled={starting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
            >
              <MessageSquare size={16} />
              {starting ? 'Открываем…' : 'Чат'}
            </button>
            <button
              ref={moreButtonRef}
              onClick={() => setMenuAnchor(moreButtonRef.current?.getBoundingClientRect() ?? null)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm font-medium text-text transition hover:bg-surface-hover"
            >
              <MoreHorizontal size={16} />
              Ещё
            </button>
          </div>
        )}

        {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}

        <div className="mx-4 divide-y divide-border rounded-xl bg-surface">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-text-muted">Имя пользователя</p>
              <p className="truncate text-sm text-text">@{profile.username}</p>
            </div>
            <button
              onClick={() => void handleCopyUsername()}
              title="Скопировать"
              className="shrink-0 rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text"
            >
              {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-text-muted">Номер телефона</p>
            <p className="text-sm text-text">Скрыт</p>
          </div>
        </div>
      </div>

      {menuAnchor && (
        <ContextMenu anchorRect={menuAnchor} items={menuItems} onClose={() => setMenuAnchor(null)} />
      )}
    </div>
  );
}
