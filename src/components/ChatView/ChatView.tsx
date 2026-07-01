import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Search, Pin, X, ArrowLeft,
  Gamepad2, Pencil, Car, Star, Music, Cloud, Gift, Heart,
  Plane, Rocket, Crown, Zap, Sun, Coffee, Umbrella, Camera,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ChatWithMeta, Message, MessageType, MemberWithProfile } from '../../types/database';
import { useMessages } from '../../hooks/useMessages';
import { useTyping } from '../../hooks/useTyping';
import { forwardMessage, fetchMessageById } from '../../lib/messages';
import { fetchChatMembers, pinMessage, unpinMessage } from '../../lib/chats';
import { useChatStore } from '../../store/chat-store';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { ForwardModal } from './ForwardModal';
import { ChatSearchBar } from './ChatSearchBar';
import { GroupMembersPanel } from './GroupMembersPanel';
import { Avatar } from '../ui/Avatar';

interface ChatViewProps {
  chat: ChatWithMeta;
  chats: ChatWithMeta[];
  currentUserId: string;
  currentUserDisplayName: string;
  onBack?: () => void;
}

function isOnline(lastSeenAt: string | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000;
}

function fileNameFromMime(mime: string, fallbackBase: string): string {
  const ext = mime.split(';')[0].split('/')[1] ?? 'webm';
  return `${fallbackBase}.${ext}`;
}

function pluralizeMembers(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} участников`;
  if (mod10 === 1) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} участника`;
  return `${n} участников`;
}

const PATTERN_ICONS: LucideIcon[] = [
  Gamepad2, Pencil, Car, Star, Music, Cloud, Gift, Heart,
  Plane, Rocket, Crown, Zap, Sun, Coffee, Umbrella, Camera,
];

// Deterministic hash so the pattern looks "scattered" but never changes between renders.
function h(n: number): number {
  let x = (((n >> 16) ^ n) * 0x45d9f3b) | 0;
  x = (((x >> 16) ^ x) * 0x45d9f3b) | 0;
  return ((x >> 16) ^ x) >>> 0;
}

function ChatWallpaper() {
  const COLS = 8;
  const ROWS = 13;
  const items: { Icon: LucideIcon; x: number; y: number; rotate: number; key: string }[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = (row * COLS + col);
      const Icon = PATTERN_ICONS[idx % PATTERN_ICONS.length];
      // Jitter so grid doesn't look mechanical
      const jx = ((h(idx * 3 + 1) % 220) - 110) / 1100;   // ±10% of cell width
      const jy = ((h(idx * 7 + 2) % 160) - 80)  / 1300;   // ±6% of cell height
      const rotate = ((h(idx * 11 + 5) % 72) - 36);        // ±36 deg
      items.push({
        Icon,
        x: (col / COLS + 1 / (COLS * 2) + jx) * 100,
        y: (row / ROWS + 1 / (ROWS * 2) + jy) * 100,
        rotate,
        key: `${row}-${col}`,
      });
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {items.map(({ Icon, x, y, rotate, key }) => (
        <div
          key={key}
          style={{
            position: 'absolute',
            left: `${x}%`,
            top: `${y}%`,
            transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
            opacity: 0.18,
            color: 'white',
            lineHeight: 1,
          }}
        >
          <Icon size={26} strokeWidth={1.5} />
        </div>
      ))}
    </div>
  );
}

function pinnedPreviewText(message: Message): string {
  if (message.deleted) return 'Сообщение удалено';
  switch (message.type) {
    case 'image':
      return '📷 Фото';
    case 'file':
      return `📎 ${message.attachment_meta?.name ?? 'Файл'}`;
    case 'voice':
      return '🎤 Голосовое сообщение';
    case 'video_note':
      return '📹 Видео-сообщение';
    default:
      return message.content ?? '';
  }
}

export function ChatView({ chat, chats, currentUserId, currentUserDisplayName, onBack }: ChatViewProps) {
  const {
    messages,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    ensureMessageLoaded,
    send,
    sendAttachment,
    sendGif,
    edit,
    remove,
    removeForMe,
    statuses,
    reactions,
    toggleReaction,
  } = useMessages(chat.id, currentUserId);
  const { typingUsers, notifyTyping } = useTyping(chat.id, currentUserId, currentUserDisplayName);

  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);

  // The pinned message is usually already in the loaded page, but for an
  // older pin (or right after opening the chat) it has to be fetched directly.
  useEffect(() => {
    if (!chat.pinned_message_id) {
      setPinnedMessage(null);
      return;
    }
    const fromLoaded = messages.find((m) => m.id === chat.pinned_message_id);
    if (fromLoaded) {
      setPinnedMessage(fromLoaded);
      return;
    }
    let cancelled = false;
    fetchMessageById(chat.pinned_message_id).then((msg) => {
      if (!cancelled) setPinnedMessage(msg);
    });
    return () => {
      cancelled = true;
    };
  }, [chat.pinned_message_id, messages]);

  async function handleTogglePin(message: Message) {
    if (chat.pinned_message_id === message.id) {
      await unpinMessage(chat.id);
      useChatStore.getState().patchChat(chat.id, { pinned_message_id: null });
    } else {
      await pinMessage(chat.id, message.id);
      useChatStore.getState().patchChat(chat.id, { pinned_message_id: message.id });
    }
  }

  const refreshMembers = useCallback(async () => {
    if (chat.type !== 'group') return;
    const fresh = await fetchChatMembers(chat.id);
    setMembers(fresh);
  }, [chat.id, chat.type]);

  useEffect(() => {
    if (chat.type !== 'group') {
      setMembers([]);
      return;
    }
    void refreshMembers();
  }, [chat.type, refreshMembers]);

  const title = chat.type === 'direct' ? chat.otherUser?.display_name ?? '…' : chat.title ?? 'Группа';
  const avatarSrc = chat.type === 'direct' ? chat.otherUser?.avatar_url : chat.avatar_url;
  const online = chat.type === 'direct' ? isOnline(chat.otherUser?.last_seen_at) : undefined;

  const subtitle = useMemo(() => {
    if (typingUsers.size > 0) {
      const names = Array.from(typingUsers.values());
      return <span className="text-accent">{names.join(', ')} печатает…</span>;
    }
    if (chat.type === 'direct') {
      return online ? 'в сети' : 'не в сети';
    }
    return pluralizeMembers(members.length);
  }, [typingUsers, chat.type, online, members.length]);

  // Group-only: who sent each message, shown above incoming bubbles (direct
  // chats never pass this — there's only one other person, already named in
  // the header, matching Telegram).
  const senderNames = useMemo(() => {
    if (chat.type !== 'group') return undefined;
    return new Map(members.map((m) => [m.user_id, m.profile.display_name]));
  }, [chat.type, members]);

  // Single place that knows how to turn a sender_id into a display name —
  // used for the reply-quote label, not the group "sender name above bubble"
  // line (that one stays group-only via senderNames, matching Telegram).
  function resolveSenderName(senderId: string | null): string {
    if (!senderId) return 'Пользователь';
    if (senderId === currentUserId) return currentUserDisplayName;
    if (chat.type === 'direct') return chat.otherUser?.display_name ?? 'Пользователь';
    return members.find((m) => m.user_id === senderId)?.profile.display_name ?? 'Участник';
  }

  async function handleSend(content: string) {
    await send(content, replyTarget?.id ?? null);
    setReplyTarget(null);
  }

  async function handleSendFile(file: File) {
    const type: MessageType = file.type.startsWith('image/') ? 'image' : 'file';
    await sendAttachment(file, type, undefined, replyTarget?.id ?? null);
    setReplyTarget(null);
  }

  async function handleSendVoice(blob: Blob, durationSeconds: number) {
    const file = new File([blob], fileNameFromMime(blob.type, 'voice'), { type: blob.type });
    await sendAttachment(file, 'voice', durationSeconds, replyTarget?.id ?? null);
    setReplyTarget(null);
  }

  async function handleSendVideoNote(blob: Blob, durationSeconds: number, mimeType: string) {
    const file = new File([blob], fileNameFromMime(mimeType, 'video_note'), { type: mimeType });
    await sendAttachment(file, 'video_note', durationSeconds, replyTarget?.id ?? null);
    setReplyTarget(null);
  }

  async function handleSendGif(gifUrl: string, title: string) {
    await sendGif(gifUrl, title, replyTarget?.id ?? null);
    setReplyTarget(null);
  }

  function handleReply(message: Message) {
    setEditingMessage(null);
    setReplyTarget(message);
  }

  function handleEdit(message: Message) {
    setReplyTarget(null);
    setEditingMessage(message);
  }

  async function handleSaveEdit(content: string) {
    if (!editingMessage) return;
    await edit(editingMessage.id, content);
    setEditingMessage(null);
  }

  async function handleDeleteForMe() {
    if (!deleteTarget) return;
    await removeForMe(deleteTarget.id);
    setDeleteTarget(null);
  }

  async function handleDeleteForEveryone() {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  async function handleForwardSelect(targetChatId: string) {
    if (!forwardTarget) return;
    const originalSenderName = forwardTarget.forwarded_from_name ?? resolveSenderName(forwardTarget.sender_id);
    await forwardMessage({
      message: forwardTarget,
      targetChatId,
      senderId: currentUserId,
      clientId: crypto.randomUUID(),
      originalSenderName,
    });
    setForwardTarget(null);
  }

  // Used both by search results and by clicking a reply quote — either can
  // point at a message older than what's currently paged in. Mark the target
  // as "pending" before loading so MessageList suppresses its own
  // auto-scroll-to-bottom while ensureMessageLoaded prepends pages, then let
  // it settle for a moment after the scroll-into-view + flash plays.
  async function handleJumpToMessage(messageId: string) {
    setHighlightMessageId(messageId);
    await ensureMessageLoaded(messageId);
    setTimeout(() => {
      setHighlightMessageId((id) => (id === messageId ? null : id));
    }, 1600);
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-3 md:px-4">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden shrink-0 rounded-full p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        {chat.type === 'group' ? (
          <button
            onClick={() => setMembersOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left transition hover:bg-surface-hover"
          >
            <Avatar name={title} src={avatarSrc} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{title}</p>
              {subtitle && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
            </div>
          </button>
        ) : (
          <>
            <Avatar name={title} src={avatarSrc} online={online} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{title}</p>
              {subtitle && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
            </div>
          </>
        )}
        <button
          onClick={() => setSearchOpen((s) => !s)}
          title="Поиск в чате"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-surface-hover ${
            searchOpen ? 'text-accent' : 'text-text-muted hover:text-text'
          }`}
        >
          <Search size={18} />
        </button>
      </div>

      {pinnedMessage && (
        <div className="flex w-full items-center gap-2 border-b border-border bg-surface px-4 py-2">
          <button
            onClick={() => void handleJumpToMessage(pinnedMessage.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <Pin size={14} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-accent">Закреплённое сообщение</p>
              <p className="truncate text-xs text-text-muted">{pinnedPreviewText(pinnedMessage)}</p>
            </div>
          </button>
          <button
            onClick={() => void handleTogglePin(pinnedMessage)}
            title="Открепить"
            className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface-hover hover:text-text"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {searchOpen && (
        <ChatSearchBar
          chatId={chat.id}
          currentUserId={currentUserId}
          onJumpTo={(message) => void handleJumpToMessage(message.id)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <div
        className="relative flex-1 flex flex-col overflow-hidden"
        style={{ background: 'linear-gradient(165deg, #c8e8f5 0%, #b4e8de 100%)' }}
      >
        <ChatWallpaper />
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          statuses={statuses}
          reactions={reactions}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loading={loading}
          onLoadMore={loadMore}
          senderNames={senderNames}
          resolveSenderName={resolveSenderName}
          onReply={handleReply}
          onEdit={handleEdit}
          onDelete={setDeleteTarget}
          onForward={setForwardTarget}
          onJumpToMessage={(messageId) => void handleJumpToMessage(messageId)}
          onToggleReaction={(messageId, emoji) => void toggleReaction(messageId, emoji)}
          pinnedMessageId={chat.pinned_message_id}
          onTogglePin={(message) => void handleTogglePin(message)}
          highlightMessageId={highlightMessageId}
        />
      </div>

      <MessageInput
        onSend={handleSend}
        onSendFile={handleSendFile}
        onSendVoice={handleSendVoice}
        onSendVideoNote={handleSendVideoNote}
        onSendGif={handleSendGif}
        onTyping={notifyTyping}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onSaveEdit={handleSaveEdit}
        resolveSenderName={resolveSenderName}
      />

      {deleteTarget && (
        <ConfirmDeleteModal
          isOwn={deleteTarget.sender_id === currentUserId}
          onDeleteForMe={() => void handleDeleteForMe()}
          onDeleteForEveryone={() => void handleDeleteForEveryone()}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {forwardTarget && (
        <ForwardModal
          chats={chats}
          onSelect={(targetChatId) => void handleForwardSelect(targetChatId)}
          onClose={() => setForwardTarget(null)}
        />
      )}

      {membersOpen && (
        <GroupMembersPanel
          chatId={chat.id}
          chatTitle={chat.title ?? 'Группа'}
          chatAvatarUrl={chat.avatar_url}
          members={members}
          currentUserId={currentUserId}
          myRole={chat.myRole}
          onClose={() => setMembersOpen(false)}
          onChanged={() => void refreshMembers()}
          onLeft={() => setMembersOpen(false)}
        />
      )}
    </div>
  );
}
