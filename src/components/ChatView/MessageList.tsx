import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageBubble } from '../Message/MessageBubble';
import { Spinner } from '../ui/Spinner';
import type { Message, MessageStatusValue } from '../../types/database';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  statuses: Map<string, MessageStatusValue>;
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  senderNames?: Map<string, string>; // for group chats
  resolveSenderName: (senderId: string | null) => string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onForward: (message: Message) => void;
  onJumpToMessage: (messageId: string) => void;
  highlightMessageId?: string | null;
}

export function MessageList({
  messages,
  currentUserId,
  statuses,
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
  highlightMessageId,
}: MessageListProps) {
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevScrollHeight = useRef(0);
  const prevMessageCount = useRef(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Auto-scroll to bottom on first load and on new messages, only if the
  // user was already near the bottom (don't yank them down mid-scrollback).
  // Suppressed while a search jump is pending/settling — a jump can prepend
  // several older pages via ensureMessageLoaded, which would otherwise also
  // look like "grew while near bottom" and yank the view back down.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const grew = messages.length > prevMessageCount.current;
    prevMessageCount.current = messages.length;
    if (grew && isNearBottom && !highlightMessageId) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isNearBottom, highlightMessageId]);

  // Scrolls to and briefly flashes a search result once it's loaded. Depends
  // on `messages` (not just the id) so it keeps retrying as ensureMessageLoaded
  // prepends older pages, until the target row actually exists in the DOM.
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
    setIsNearBottom(distanceFromBottom < 150);
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
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2">
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
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onForward={onForward}
              onJumpToMessage={onJumpToMessage}
            />
          </div>
        );
      })}
    </div>
  );
}
