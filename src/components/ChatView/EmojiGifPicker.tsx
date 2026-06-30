import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { EMOJI_CATEGORIES } from '../../lib/emoji-data';
import { searchGifs, type GifResult } from '../../lib/giphy';
import { Spinner } from '../ui/Spinner';

interface EmojiGifPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectGif: (gif: GifResult) => void;
  onClose: () => void;
}

export function EmojiGifPicker({ onSelectEmoji, onSelectGif, onClose }: EmojiGifPickerProps) {
  const [tab, setTab] = useState<'emoji' | 'gif'>('emoji');
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (tab !== 'gif') return;
    let cancelled = false;
    setGifLoading(true);
    setGifError(null);
    const t = setTimeout(() => {
      searchGifs(gifQuery)
        .then((results) => !cancelled && setGifs(results))
        .catch(() => !cancelled && setGifError('Не удалось загрузить GIF'))
        .finally(() => !cancelled && setGifLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tab, gifQuery]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 z-20 mb-2 flex h-80 w-80 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
    >
      <div className="flex shrink-0 border-b border-border">
        <button
          onClick={() => setTab('emoji')}
          className={`flex-1 py-2 text-sm font-medium transition ${
            tab === 'emoji' ? 'border-b-2 border-accent text-accent' : 'text-text-muted hover:text-text'
          }`}
        >
          Эмодзи
        </button>
        <button
          onClick={() => setTab('gif')}
          className={`flex-1 py-2 text-sm font-medium transition ${
            tab === 'gif' ? 'border-b-2 border-accent text-accent' : 'text-text-muted hover:text-text'
          }`}
        >
          GIF
        </button>
      </div>

      {tab === 'emoji' ? (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {EMOJI_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-2">
              <p className="mb-1 px-1 text-xs text-text-muted">{cat.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emoji.map((e) => (
                  <button
                    key={e}
                    onClick={() => onSelectEmoji(e)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition hover:bg-surface-hover"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-2 pt-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1.5">
              <Search size={14} className="shrink-0 text-text-muted" />
              <input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder="Поиск GIF…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {gifLoading && (
              <div className="flex h-full items-center justify-center">
                <Spinner className="h-5 w-5" />
              </div>
            )}
            {!gifLoading && gifError && <p className="px-2 py-4 text-center text-xs text-red-400">{gifError}</p>}
            {!gifLoading && !gifError && gifs.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-text-muted">Ничего не найдено</p>
            )}
            {!gifLoading && !gifError && gifs.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    onClick={() => onSelectGif(gif)}
                    className="overflow-hidden rounded-lg transition hover:opacity-80"
                  >
                    <img src={gif.previewUrl} alt={gif.title} className="h-24 w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
