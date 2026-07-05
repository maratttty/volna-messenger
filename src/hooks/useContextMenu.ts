import { useCallback, useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

export interface ContextMenuPosition {
  x: number;
  y: number;
}

// Opens at the right-click point on desktop, or via long-press on touch/pen.
// After a long press fires, the next click event is swallowed (capture phase,
// window level) to prevent the finger-lift from closing the menu or opening
// the underlying item.
export function useContextMenu() {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPoint = useRef<ContextMenuPosition | null>(null);
  const swallowClickRef = useRef<((e: Event) => void) | null>(null);

  const removeSwallow = useCallback(() => {
    if (swallowClickRef.current) {
      window.removeEventListener('click', swallowClickRef.current, true);
      swallowClickRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, []);

  // Clean up on unmount
  useEffect(() => () => { clearTimer(); removeSwallow(); }, [clearTimer, removeSwallow]);

  const close = useCallback(() => setPosition(null), []);

  const onContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      removeSwallow(); // clear any leftover from a previous interaction
      startPoint.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      longPressTimer.current = setTimeout(() => {
        setPosition({ x: e.clientX, y: e.clientY });

        // Swallow the click that fires when the user lifts the finger after
        // the long press is detected. Without this, the finger-lift produces a
        // click that closes the menu (overlay onClick) and/or opens the chat.
        const swallow = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener('click', swallow, true);
          swallowClickRef.current = null;
        };
        swallowClickRef.current = swallow;
        window.addEventListener('click', swallow, true);
      }, LONG_PRESS_MS);
    },
    [clearTimer, removeSwallow],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!startPoint.current) return;
      const dx = e.clientX - startPoint.current.x;
      const dy = e.clientY - startPoint.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearTimer();
    },
    [clearTimer],
  );

  const onPointerUp = useCallback(() => clearTimer(), [clearTimer]);

  return {
    position,
    close,
    triggerProps: {
      onContextMenu,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
