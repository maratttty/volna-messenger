import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { searchMessagesInChat } from '../../lib/messages';
import { formatSearchResultTime } from '../../lib/time';
import { Avatar } from '../ui/Avatar';
import type { Message } from '../../types/database';

interface SenderInfo {
  name: string;
  avatarUrl: string | null;
}

interface ChatSearchBarProps {
  chatId: string;
  currentUserId: string;
  senderInfo: Map<string, SenderInfo>;
  onJumpTo: (message: Message) => void;
  onClose: () => void;
}

function mediaSnippet(message: Message): string {
  switch (message.type) {
    case 'image':
      return '📷 Фото';
    case 'file':
      return `📎 ${message.attachment_meta?.name ?? 'Файл'}`;
    case 'voice':
      return '🎤 Голосовое';
    case 'video_note':
      return '📹 Видео';
    default:
      return '';
  }
}

// Windowed preview around the first match, with the matched substring split
// out so it can be highlighted — case-insensitive, matches the ilike search.
function highlightedSnippet(
  content: string,
  query: string,
  maxLen = 90,
): { before: string; match: string; after: string } | null {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return null;

  const matchEnd = idx + query.length;
  const pad = Math.max(0, Math.floor((maxLen - query.length) / 2));
  const start = Math.max(0, idx - pad);
  const end = Math.min(content.length, matchEnd + pad);

  return {
    before: (start > 0 ? '…' : '') + content.slice(start, idx),
    match: content.slice(idx, matchEnd),
    after: content.slice(matchEnd, end) + (end < content.length ? '…' : ''),
  };
}

export function ChatSearchBar({ chatId, currentUserId, senderInfo, onJumpTo, onClose }: ChatSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search-as-you-type, substring match against message content.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchMessagesInChat(chatId, currentUserId, trimmed)
        .then((found) => !cancelled && setResults(found))
        .catch((err) => {
          if (cancelled) return;
          console.error('Ошибка поиска по чату:', err);
          setResults([]);
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, currentUserId, query]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="border-b border-border bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <Search size={16} className="shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск в чате…"
          className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        />
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface-hover hover:text-text"
        >
          <X size={16} />
        </button>
      </div>

      {query.trim() && (
        <div className="mt-2 max-h-64 overflow-y-auto">
          {loading && <p className="px-2 py-2 text-xs text-text-muted">Поиск…</p>}
          {!loading && results.length === 0 && (
            <p className="px-2 py-2 text-xs text-text-muted">Ничего не найдено</p>
          )}
          {!loading &&
            results.map((message) => {
              const sender = (message.sender_id && senderInfo.get(message.sender_id)) || {
                name: 'Пользователь',
                avatarUrl: null,
              };
              const highlighted = message.content ? highlightedSnippet(message.content, query.trim()) : null;

              return (
                <button
                  key={message.id}
                  onClick={() => onJumpTo(message)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-hover"
                >
                  <Avatar name={sender.name} src={sender.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-text">{sender.name}</span>
                      <span className="shrink-0 text-xs text-text-muted">
                        {formatSearchResultTime(message.created_at)}
                      </span>
                    </div>
                    <div className="truncate text-sm text-text-muted">
                      {highlighted ? (
                        <>
                          {highlighted.before}
                          <mark className="rounded bg-accent/30 text-text">{highlighted.match}</mark>
                          {highlighted.after}
                        </>
                      ) : (
                        mediaSnippet(message)
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
