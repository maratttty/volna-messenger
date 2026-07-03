import { useLayoutEffect, useEffect, useMemo, useRef, useState, Fragment } from 'react';
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
  // Captured at the moment the chat was opened (before markChatRead resets it)
  initialLastReadId?: string | null;
  // Unread count captured at chat-open time — initialises the ↓ badge
  initialUnreadCount?: number;
}

// Approximate height of the "Непрочитанные сообщения" divider (px).
// Used to leave space above the first unread bubble.
const DIVIDER_H = 44;

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
  initialUnreadCount = 0,
}: MessageListProps) {
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevScrollHeight = useRef(0);
  const prevMessageCountRef = useRef(0);
  const didInitialScroll = useRef(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Starts with initialUnreadCount so the ↓ badge is visible right away.
  // Increments as new messages arrive while the user is scrolled up.
  // Resets to 0 when the user reaches the bottom.
  const [newWhileAway, setNewWhileAway] = useState(initialUnreadCount);

  // The ID of the first message the user hasn't read yet, used to:
  //   1. Render the "Непрочитанные сообщения" divider before it
  //   2. Set the initial scroll position
  const firstUnreadId = useMemo<string | null>(() => {
    if (messages.length === 0) return null;

    if (!initialLastReadId) {
      // No cursor at all — treat the whole page as unread if the count says so
      return initialUnreadCount > 0 ? messages[0].id : null;
    }

    const idx = messages.findIndex((m) => m.id === initialLastReadId);
    if (idx === -1) {
      // Cursor is older than the loaded page → all loaded messages are unread
      return initialUnreadCount > 0 ? messages[0].id : null;
    }
    if (idx >= messages.length - 1) return null; // everything is read
    return messages[idx + 1].id;
  }, [messages, initialLastReadId, initialUnreadCount]);

  // One-time initial scroll. Runs BEFORE the browser paints (useLayoutEffect)
  // so the user never sees the wrong scroll position even for a single frame.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || didInitialScroll.current || messages.length === 0) return;
    didInitialScroll.current = true;

    if (firstUnreadId) {
      const firstUnreadEl = rowRefs.current.get(firstUnreadId);
      if (firstUnreadEl) {
        // With scrollTop still at 0, getBoundingClientRect values equal the
        // element's distance from the viewport top — so the difference is the
        // offset of the target inside the scroll container.
        const containerTop = el.getBoundingClientRect().top;
        const targetTop = firstUnreadEl.getBoundingClientRect().top;
        el.scrollTop = Math.max(0, targetTop - containerTop - DIVIDER_H);
        setIsNearBottom(false);
        return;
      }
    }

    // No unread (or cursor not in this page) → jump straight to the bottom.
    el.scrollTop = el.scrollHeight;
  }, [messages, firstUnreadId]);

  // Auto-scroll to bottom when new messages arrive — only while already near bottom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const grew = messages.length > prevCount;

    // prevCount === 0 → initial batch, handled by useLayoutEffect above
    if (!grew || prevCount === 0 || highlightMessageId) return;

    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    } else {
      const incoming = messages.slice(prevCount).filter((m) => m.sender_id !== currentUserId).length;
      if (incoming > 0) setNewWhileAway((n) => n + incoming);
    }
  }, [messages, isNearBottom, highlightMessageId, currentUserId]);

  // Scroll to and briefly flash a search/reply-jump result.
  useEffect(() => {
    if (!highlightMessageId) return;
    const el = rowRefs.current.get(highlightMessageId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(highlightMessageId);
    const timer = setTimeout(() => setFlashId(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightMessageId, messages]);

  // Preserve scroll position when older messages are prepended (scroll-up pagination).
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
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
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
          <Fragment key={msg.id}>
            {firstUnreadId === msg.id && (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="h-px flex-1 bg-accent/50" />
                <span className="rounded-full bg-accent/15 px-3 py-0.5 text-xs font-medium text-accent">
                  Непрочитанные сообщения
                </span>
                <div className="h-px flex-1 bg-accent/50" />
              </div>
            )}
            <div
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
          </Fragment>
        );
      })}

      {/* Floating ↓ button — visible when scrolled up; badge shows unread count */}
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
