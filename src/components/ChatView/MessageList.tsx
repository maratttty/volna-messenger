import { useLayoutEffect, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import { MessageBubble } from '../Message/MessageBubble';
import { Spinner } from '../ui/Spinner';
import type { Message, MessageStatusValue, ReactionSummary, Profile } from '../../types/database';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  statuses: Map<string, MessageStatusValue>;
  reactions: Map<string, ReactionSummary[]>;
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
  fetchDone: boolean;
  onLoadMore: () => void;
  senderNames?: Map<string, string>;
  senderProfiles?: Map<string, Profile>;
  onOpenProfile: (profile: Profile) => void;
  resolveSenderName: (senderId: string | null) => string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onForward: (message: Message) => void;
  onJumpToMessage: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  pinnedMessageIds: Set<string>;
  onTogglePin: (message: Message) => void;
  highlightMessageId?: string | null;
  // Captured at chat-open time before markChatRead resets the cursor
  initialLastReadId?: string | null;
  // Unread count at chat-open time — seeds the ↓ badge
  initialUnreadCount?: number;
}

export function MessageList({
  messages,
  currentUserId,
  statuses,
  reactions,
  hasMore,
  loadingMore,
  loading,
  fetchDone,
  onLoadMore,
  senderNames,
  senderProfiles,
  onOpenProfile,
  resolveSenderName,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onJumpToMessage,
  onToggleReaction,
  pinnedMessageIds,
  onTogglePin,
  highlightMessageId,
  initialLastReadId,
  initialUnreadCount = 0,
}: MessageListProps) {
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Attached to the "Непрочитанные сообщения" divider for scroll targeting.
  // offsetTop is layout-based and unaffected by CSS transforms on ancestors
  // (getBoundingClientRect would be wrong when a parent has anim-slide-right).
  const dividerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevScrollHeight = useRef(0);
  const prevMessageCountRef = useRef(0);
  // Two-phase initial scroll:
  // - staleScrollDone: quick scroll using whatever Zustand has cached at mount time
  // - freshScrollDone: definitive scroll once the real server fetch completes
  // Splitting them ensures the correct position is applied even when React 18
  // batches loading=true/false into a single render (no spinner, same DOM element).
  const staleScrollDone = useRef(false);
  const freshScrollDone = useRef(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Initialised with the unread count at open time so the ↓ badge is shown
  // immediately. Increments when new messages arrive while scrolled away.
  // Resets to 0 when the user reaches the bottom.
  const [newWhileAway, setNewWhileAway] = useState(initialUnreadCount);
  // Computed ONCE after the initial server fetch (fetchDone = true), then frozen
  // so that realtime messages arriving while the chat is open never move the divider.
  const firstUnreadIdRef = useRef<string | null>(null);
  const firstUnreadIdComputed = useRef(false);

  if (!firstUnreadIdComputed.current && fetchDone && messages.length > 0) {
    firstUnreadIdComputed.current = true;
    let startIdx = 0;
    if (initialLastReadId) {
      const idx = messages.findIndex((m) => m.id === initialLastReadId);
      if (idx !== -1) startIdx = idx + 1;
      // idx === -1: cursor predates this page — search from index 0
    }
    for (let i = startIdx; i < messages.length; i++) {
      if (messages[i].sender_id !== currentUserId) {
        firstUnreadIdRef.current = messages[i].id;
        break;
      }
    }
  }

  const firstUnreadId = firstUnreadIdRef.current;

  // One-time initial scroll. Runs BEFORE paint (useLayoutEffect) so the user
  // never sees the wrong position. Uses dividerRef.offsetTop which is
  // layout-relative (not viewport-relative) — safe even during slide animations.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || messages.length === 0) return;

    // ── Phase 2: definitive scroll after the real server fetch ────────────────
    // Runs once when fetchDone first becomes true. Always fires regardless of
    // whether the container remounted (handles React 18 batching that can skip
    // the spinner render, keeping the same DOM element throughout).
    if (fetchDone && !freshScrollDone.current) {
      freshScrollDone.current = true;

      if (dividerRef.current) {
        // Case A: unread messages — scroll to divider
        el.scrollTop = dividerRef.current.offsetTop;
        setIsNearBottom(false);
        return;
      }

      // Case B: no unread — scroll to the very bottom.
      el.scrollTop = el.scrollHeight;
      // Capture the browser-clamped bottom position (= scrollHeight − clientHeight).
      const bottomScrollTop = el.scrollTop;

      // Images may not be loaded when useLayoutEffect fires, making scrollHeight
      // smaller than the final value. Re-scroll on each image load, but only if
      // the user hasn't scrolled up manually (scrollTop hasn't decreased).
      const rescrollIfNotScrolledUp = () => {
        const c = containerRef.current;
        if (!c || c.scrollTop < bottomScrollTop - 10) return;
        c.scrollTop = c.scrollHeight;
      };

      const imgs = Array.from(el.querySelectorAll<HTMLImageElement>('img')).filter((img) => !img.complete);
      imgs.forEach((img) => img.addEventListener('load', rescrollIfNotScrolledUp, { once: true }));
      const timer = setTimeout(rescrollIfNotScrolledUp, 1000);

      return () => {
        imgs.forEach((img) => img.removeEventListener('load', rescrollIfNotScrolledUp));
        clearTimeout(timer);
      };
    }

    // ── Phase 1: quick scroll using stale Zustand cache ───────────────────────
    // Provides an immediate visual position before the fetch completes.
    // Skipped once fetchDone is true — Phase 2 handles everything from that point.
    if (!staleScrollDone.current && !fetchDone) {
      staleScrollDone.current = true;
      if (dividerRef.current) {
        el.scrollTop = dividerRef.current.offsetTop;
        setIsNearBottom(false);
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages, firstUnreadId, fetchDone]);

  // Auto-scroll to bottom when new messages arrive while the user is near bottom.
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

  // Scroll to and briefly flash a search/reply-jump target.
  useEffect(() => {
    if (!highlightMessageId) return;
    const el = rowRefs.current.get(highlightMessageId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(highlightMessageId);
    const timer = setTimeout(() => setFlashId(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightMessageId, messages]);

  // Preserve scroll position when older messages are prepended (infinite-scroll up).
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

  if (loading && messages.length === 0) {
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
    // Outer wrapper: relative so the ↓ button is positioned relative to the
    // visible chat area, not to the scrollable content inside it.
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        // position:relative so that child offsetTop values are relative to THIS
        // container (needed for the dividerRef.offsetTop scroll calculation).
        className="relative h-full overflow-y-auto py-2"
      >
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
                <div ref={dividerRef} className="flex items-center gap-3 px-4 py-2.5">
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
                  senderProfile={msg.sender_id ? senderProfiles?.get(msg.sender_id) : undefined}
                  onOpenProfile={onOpenProfile}
                  repliedMessage={repliedMessage}
                  repliedSenderName={repliedMessage ? resolveSenderName(repliedMessage.sender_id) : undefined}
                  reactions={reactions.get(msg.id)}
                  isPinned={pinnedMessageIds.has(msg.id)}
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
      </div>

      {/* Floating ↓ button — positioned relative to the outer wrapper (NOT the
          scroll container), so it stays fixed in the bottom-right corner of the
          visible chat area regardless of how far the user has scrolled. */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="anim-pop absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-lg transition hover:bg-surface-hover hover:text-text"
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
