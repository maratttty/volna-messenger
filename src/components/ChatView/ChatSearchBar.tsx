import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { searchMessagesInChat } from '../../lib/messages';
import { formatRelativeTime } from '../../lib/time';
import type { Message } from '../../types/database';

interface ChatSearchBarProps {
  chatId: string;
  currentUserId: string;
  onJumpTo: (message: Message) => void;
  onClose: () => void;
}

function snippet(message: Message): string {
  if (message.content) return message.content;
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
      return '';
  }
}

export function ChatSearchBar({ chatId, currentUserId, onJumpTo, onClose }: ChatSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search-as-you-type against the server-side search_vector index.
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
        .catch(() => !cancelled && setResults([]))
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
            results.map((message) => (
              <button
                key={message.id}
                onClick={() => onJumpTo(message)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-hover"
              >
                <span className="w-full truncate text-sm text-text">{snippet(message)}</span>
                <span className="text-xs text-text-muted">{formatRelativeTime(message.created_at)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
