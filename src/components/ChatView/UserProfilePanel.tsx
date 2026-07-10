import { useState } from 'react';
import { MessageSquare, Bell, BellOff } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import type { Profile } from '../../types/database';
import { getOrCreateDirectChat, setChatMuted } from '../../lib/chats';
import { formatLastSeen } from '../../lib/time';
import { useChatStore } from '../../store/chat-store';

interface UserProfilePanelProps {
  profile: Profile;
  currentUserId: string;
  // Set when `profile` is the partner of an existing direct chat — hides
  // "Написать сообщение" (already there) and shows the mute toggle for that
  // chat instead. Omitted (e.g. a group member with no direct chat yet)
  // shows "Написать сообщение" and hides mute — there's no per-user mute,
  // only per-chat, so muting only makes sense once a chat exists.
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
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = profile.id === currentUserId;
  const online = profile.show_last_seen !== false && isOnline(profile.last_seen_at);
  const statusText = online
    ? 'в сети'
    : profile.show_last_seen === false
      ? 'не в сети'
      : formatLastSeen(profile.last_seen_at) ?? 'не в сети';

  async function handleMessage() {
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
    setToggling(true);
    try {
      await setChatMuted(directChatId, currentUserId, next);
    } catch {
      setMutedLocal(!next);
      useChatStore.getState().setMuted(directChatId, !next);
    } finally {
      setToggling(false);
    }
  }

  return (
    <Modal title="Профиль" onClose={onClose}>
      {/* max-h + overflow so a long bio scrolls inside the panel instead of
          pushing it past the screen edge — the panel itself must always
          stay fully within the viewport. */}
      <div className="max-h-[70vh] overflow-y-auto">
        <div className="flex flex-col items-center gap-1 pb-1">
          <Avatar name={profile.display_name} src={profile.avatar_url} size="xl" online={online} />
          <p className="mt-3 text-xl font-semibold text-text">{profile.display_name}</p>
          <p className="text-sm text-text-muted">@{profile.username}</p>
          <p className="text-xs text-text-muted">{statusText}</p>
        </div>

        {profile.bio && (
          <div className="mt-3 rounded-lg bg-bg px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">О себе</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text">{profile.bio}</p>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        {!isSelf && (
          <div className="mt-4 flex flex-col gap-2">
            {!directChatId ? (
              <button
                onClick={() => void handleMessage()}
                disabled={starting}
                className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
              >
                <MessageSquare size={16} />
                {starting ? 'Открываем…' : 'Написать сообщение'}
              </button>
            ) : (
              <button
                onClick={() => void handleToggleMute()}
                disabled={toggling}
                className="flex items-center justify-center gap-2 rounded-lg bg-bg px-4 py-2.5 text-sm font-medium text-text transition hover:bg-surface-hover disabled:opacity-50"
              >
                {muted ? <Bell size={16} /> : <BellOff size={16} />}
                {muted ? 'Включить уведомления' : 'Отключить уведомления'}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
