import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  // Optional horizontal row of quick-pick emoji shown above the item list
  // (Telegram/WhatsApp-style reaction bar on long-press/right-click).
  quickReactions?: string[];
  onQuickReact?: (emoji: string) => void;
}

const MARGIN = 8;

export function ContextMenu({ x, y, items, onClose, quickReactions, onQuickReact }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; visible: boolean }>({
    left: x,
    top: y,
    visible: false,
  });

  // Anchored at the tap/click point, which can land near any screen edge —
  // measure once mounted and clamp so the menu never overflows the viewport.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - MARGIN);
    const top = Math.min(y, window.innerHeight - rect.height - MARGIN);
    setPos({ left: Math.max(MARGIN, left), top: Math.max(MARGIN, top), visible: true });
  }, [x, y]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        style={{ left: pos.left, top: pos.top, opacity: pos.visible ? 1 : 0 }}
        className="fixed min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {quickReactions && quickReactions.length > 0 && (
          <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1.5">
            {quickReactions.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onQuickReact?.(emoji);
                  onClose();
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg transition hover:bg-surface-hover hover:scale-110"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-surface-hover ${
              item.danger ? 'text-red-400' : 'text-text'
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
