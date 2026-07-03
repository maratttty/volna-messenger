import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MessageBubble } from '../Message/MessageBubble';
import { Spinner } from '../ui/Spinner';
import type { Message, MessageStatusValue, ReactionSummary } from '../../types/database';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  statuses: Map<string, MessageStatusValue>;
  reactions: Map<string, ReactionSummary[]>;
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  senderNames?: Map<string, string>;
  resolveSenderName: (senderId: string | null) => string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onForward: (message: Message) => void;
  onJumpToMessage: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  pinnedMessageId: string | null;
  onTogglePin: (message: Message) => void;
  highlightMessageId?: string | null;
  // The last_read_message_id captured at the moment the chat was opened —
  // used to scroll to the first unread message on initial load.
  initialLastReadId?: string | null;
}

export function MessageList({
  messages,
  currentUserId,
  statuses,
  reactions,
  hasMore,
  loadingMore,
  loading,
  onLoadMore,
  senderNames,
  resolveSenderName,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onJumpToMessage,
  onToggleReaction,
  pinnedMessageId,
  onTogglePin,
  highlightMessageId,
  initialLastReadId,
}: MessageListProps) {
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevScrollHeight = useRef(0);
  const prevMessageCountRef = useRef(0);
  // Becomes true after the one-time initial scroll (to first unread or bottom).
  const didInitialScroll = useRef(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Count of incoming messages that arrived while the user was scrolled up.
  const [newWhileAway, setNewWhileAway] = useState(0);

  // One-time scroll: when messages first populate, jump to the first unread
  // message (or to the bottom if everything is already read / the read cursor
  // is not in the current page).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || didInitialScroll.current || messages.length === 0) return;
    didInitialScroll.current = true;

    if (initialLastReadId) {
      const lastReadIdx = messages.findIndex((m) => m.id === initialLastReadId);
      if (lastReadIdx !== -1 && lastReadIdx < messages.length - 1) {
        const firstUnreadId = messages[lastReadIdx + 1].id;
        const firstUnreadEl = rowRefs.current.get(firstUnreadId);
        if (firstUnreadEl) {
          firstUnreadEl.scrollIntoView({ block: 'start' });
          setIsNearBottom(false);
          return;
        }
      }
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, initialLastReadId]);

  // Auto-scroll to bottom when new messages arrive (only if near bottom).
  // Skips the initial batch (handled above) and search jumps.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const grew = messages.length > prevCount;

    // prevCount === 0 → initial batch, handled by the effect above
    if (!grew || prevCount === 0 || highlightMessageId) return;

    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    } else {
      // Tally new incoming messages for the ↓ badge
      const incoming = messages.slice(prevCount).filter((m) => m.sender_id !== currentUserId).length;
      if (incoming > 0) setNewWhileAway((n) => n + incoming);
    }
  }, [messages, isNearBottom, highlightMessageId, currentUserId]);

  // Scroll to and briefly flash a search result once it's in the DOM.
  useEffect(() => {
    if (!highlightMessageId) return;
    const el = rowRefs.current.get(highlightMessageId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(highlightMessageId);
    const timer = setTimeout(() => setFlashId(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightMessageId, messages]);

  // Preserve scroll position when older messages are prepended.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (prevScrollHeight.current && el.scrollHeight !== prevScrollHeight.current) {
      el.scrollTop += el.scrollHeight - prevScrollHeight.current;
    }
  }, [messages]);

  useEffect(() => {
    const el = containerRef.current;
    const sentinel = topSentinelRef.current;
    if (!el || !sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          prevScrollHeight.current = el.scrollHeight;
          onLoadMore();
        }
      },
      { root: el, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 150;
    setIsNearBottom(near);
    if (near) setNewWhileAway(0);
  }

  function scrollToBottom() {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setNewWhileAway(0);
    setIsNearBottom(true);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        Сообщений пока нет — напишите первым
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto py-2">
      <div ref={topSentinelRef} />
      {loadingMore && (
        <div className="flex justify-center py-2">
          <Spinner className="h-4 w-4" />
        </div>
      )}
      {messages.map((msg) => {
        const repliedMessage = msg.reply_to_id ? messageById.get(msg.reply_to_id) : undefined;
        return (
          <div
            key={msg.id}
            ref={(el) => {
              if (el) rowRefs.current.set(msg.id, el);
              else rowRefs.current.delete(msg.id);
            }}
            className={`transition-colors duration-500 ${flashId === msg.id ? 'bg-accent/15' : ''}`}
          >
            <MessageBubble
              message={msg}
              isOwn={msg.sender_id === currentUserId}
              status={statuses.get(msg.id)}
              senderName={msg.sender_id ? senderNames?.get(msg.sender_id) : undefined}
              repliedMessage={repliedMessage}
              repliedSenderName={repliedMessage ? resolveSenderName(repliedMessage.sender_id) : undefined}
              reactions={reactions.get(msg.id)}
              isPinned={pinnedMessageId === msg.id}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onForward={onForward}
              onJumpToMessage={onJumpToMessage}
              onToggleReaction={(emoji) => onToggleReaction(msg.id, emoji)}
              onTogglePin={() => onTogglePin(msg)}
            />
          </div>
        );
      })}

      {/* Floating scroll-to-bottom button — visible when the user has scrolled up */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="anim-pop absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-lg transition hover:bg-surface-hover hover:text-text"
        >
          <ChevronDown size={20} />
          {newWhileAway > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {newWhileAway > 99 ? '99+' : newWhileAway}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
