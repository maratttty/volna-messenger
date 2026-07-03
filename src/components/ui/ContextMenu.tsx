import { useLayoutEffect, useEffect, useRef, useState, useCallback } from 'react';
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
  items: ContextMenuItem[];
  onClose: () => void;
  quickReactions?: string[];
  onQuickReact?: (emoji: string) => void;
}

const MARGIN = 8;
const GAP = 6;
const MORE_REACTIONS = ['😢', '🙏', '🎉', '👏', '💯', '😍', '🤔', '😅', '👎', '💔', '😡', '🤩'];

export function ContextMenu({
  anchorRect,
  items,
  onClose,
  quickReactions,
  onQuickReact,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMore, setShowMore] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string; visible: boolean }>({
    left: 0,
    top: 0,
    origin: 'top center',
    visible: false,
  });

  const calcPos = useCallback(() => {
    const el = menuRef.current;
    if (!el) return;

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w === 0 || h === 0) return; // not laid out yet — RAF will retry

    // Use visualViewport for correct dimensions on mobile (keyboard, pinch-zoom)
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    // visualViewport may have an offset when zoomed
    const vOffsetX = window.visualViewport?.offsetLeft ?? 0;
    const vOffsetY = window.visualViewport?.offsetTop ?? 0;

    // Center horizontally over the bubble, clamped strictly inside viewport
    let left = anchorRect.left + (anchorRect.width - w) / 2;
    left = Math.max(vOffsetX + MARGIN, Math.min(left, vOffsetX + vw - w - MARGIN));

    // Prefer below; show above only if not enough space below
    const spaceBelow = vh - (anchorRect.bottom - vOffsetY) - GAP;
    const spaceAbove = anchorRect.top - vOffsetY - GAP;
    let top: number;
    let origin: string;

    if (spaceBelow >= h) {
      top = anchorRect.bottom + GAP;
      origin = 'top center';
    } else if (spaceAbove >= h) {
      top = anchorRect.top - h - GAP;
      origin = 'bottom center';
    } else {
      // Not enough room either way — go below, clamp into viewport
      top = anchorRect.bottom + GAP;
      origin = 'top center';
    }

    top = Math.max(vOffsetY + MARGIN, Math.min(top, vOffsetY + vh - h - MARGIN));

    setPos({ left, top, origin, visible: true });
  }, [anchorRect]);

  useLayoutEffect(() => {
    calcPos();
    // Retry after paint in case offsetWidth/offsetHeight were 0 on first layout
    const raf = requestAnimationFrame(calcPos);
    return () => cancelAnimationFrame(raf);
  }, [calcPos, showMore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Overlay — separate from menu so menu's position:fixed uses the viewport, not this element */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />

      {/* Menu — sibling of overlay, not a child, to avoid containing-block bugs on mobile */}
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          zIndex: 51,
          opacity: pos.visible ? 1 : 0,
          transform: pos.visible ? 'scale(1)' : 'scale(0.88)',
          transformOrigin: pos.origin,
          transition: pos.visible
            ? 'opacity 0.15s ease-out, transform 0.15s ease-out'
            : 'none',
        }}
        className="min-w-[160px] max-w-[240px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
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
    </>
  );
}
