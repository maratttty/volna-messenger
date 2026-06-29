import { useMemo, useState, useCallback, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { ChatWithMeta, Message, MessageType, MemberWithProfile } from '../../types/database';
import { useMessages } from '../../hooks/useMessages';
import { useTyping } from '../../hooks/useTyping';
import { forwardMessage } from '../../lib/messages';
import { fetchChatMembers } from '../../lib/chats';
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

export function ChatView({ chat, chats, currentUserId, currentUserDisplayName }: ChatViewProps) {
  const {
    messages,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    ensureMessageLoaded,
    send,
    sendAttachment,
    edit,
    remove,
    statuses,
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

  async function handleConfirmDelete() {
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

  // Search results can point at messages older than what's currently paged
  // in. Mark the target as "pending" before loading so MessageList suppresses
  // its own auto-scroll-to-bottom while ensureMessageLoaded prepends pages,
  // then let it settle for a moment after the scroll-into-view + flash plays.
  async function handleJumpToSearchResult(message: Message) {
    setHighlightMessageId(message.id);
    await ensureMessageLoaded(message.id);
    setTimeout(() => {
      setHighlightMessageId((id) => (id === message.id ? null : id));
    }, 1600);
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
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

      {searchOpen && (
        <ChatSearchBar
          chatId={chat.id}
          onJumpTo={(message) => void handleJumpToSearchResult(message)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        statuses={statuses}
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
        highlightMessageId={highlightMessageId}
      />

      <MessageInput
        onSend={handleSend}
        onSendFile={handleSendFile}
        onSendVoice={handleSendVoice}
        onSendVideoNote={handleSendVideoNote}
        onTyping={notifyTyping}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onSaveEdit={handleSaveEdit}
        resolveSenderName={resolveSenderName}
      />

      {deleteTarget && (
        <ConfirmDeleteModal onConfirm={() => void handleConfirmDelete()} onClose={() => setDeleteTarget(null)} />
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
