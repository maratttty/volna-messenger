import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  anchorRect: DOMRect;
  align?: 'left' | 'right';
  items: ContextMenuItem[];
  onClose: () => void;
  quickReactions?: string[];
  onQuickReact?: (emoji: string) => void;
}

const MARGIN = 8;
const GAP = 4;
const MORE_REACTIONS = ['😢', '🙏', '🎉', '👏', '💯', '😍', '🤔', '😅', '👎', '💔', '😡', '🤩'];

export function ContextMenu({
  anchorRect,
  align = 'left',
  items,
  onClose,
  quickReactions,
  onQuickReact,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMore, setShowMore] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; visible: boolean }>({
    left: 0,
    top: 0,
    visible: false,
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    // offsetWidth/offsetHeight ignore CSS transforms — always returns real dimensions
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    // Vertical: prefer below anchor, flip above if more space there
    const spaceBelow = window.innerHeight - anchorRect.bottom - GAP;
    const spaceAbove = anchorRect.top - GAP;
    let top: number;
    if (h <= spaceBelow || spaceBelow >= spaceAbove) {
      top = anchorRect.bottom + GAP;
    } else {
      top = anchorRect.top - h - GAP;
    }
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - h - MARGIN));

    // Horizontal: align right edge to right of bubble for own msgs, left edge to left for others
    let left = align === 'right' ? anchorRect.right - w : anchorRect.left;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN));

    setPos({ left, top, visible: true });
  }, [anchorRect, align, showMore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          opacity: pos.visible ? 1 : 0,
          transform: pos.visible ? 'scale(1)' : 'scale(0.92)',
          transformOrigin: `top ${align}`,
          transition: pos.visible
            ? 'opacity 0.15s ease-out, transform 0.15s ease-out'
            : 'none',
        }}
        className="w-[220px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quick reactions row */}
        {quickReactions && quickReactions.length > 0 && (
          <div className="border-b border-border p-1.5">
            <div className="flex items-center">
              {quickReactions.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onQuickReact?.(emoji); onClose(); }}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl text-xl transition hover:bg-surface-hover active:scale-90"
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={(e) => { e.stopPropagation(); setShowMore((v) => !v); }}
                className={`flex h-10 w-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-surface-hover ${showMore ? 'bg-surface-hover text-accent' : 'text-text-muted'}`}
              >
                <Plus size={15} />
              </button>
            </div>
            {showMore && (
              <div className="mt-1 grid grid-cols-6">
                {MORE_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onQuickReact?.(emoji); onClose(); }}
                    className="flex h-9 items-center justify-center rounded-xl text-xl transition hover:bg-surface-hover active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action items */}
        {items.length > 0 && (
          <div className="py-1">
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick();
                  onClose();
                }}
                disabled={item.disabled}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition ${
                  item.disabled
                    ? 'cursor-default opacity-40 text-text-muted'
                    : item.danger
                      ? 'text-red-400 hover:bg-surface-hover'
                      : 'text-text hover:bg-surface-hover'
                }`}
              >
                <item.icon size={16} className="shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
