import { useCallback, useRef, useState, type PointerEvent, type MouseEvent } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

export interface ContextMenuPosition {
  x: number;
  y: number;
}

// Opens at the right-click point on desktop, or via long-press on touch/pen
// (those devices don't fire a usable contextmenu event consistently). Spread
// `triggerProps` onto whatever element should respond to both.
export function useContextMenu() {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPoint = useRef<ContextMenuPosition | null>(null);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, []);

  const close = useCallback(() => setPosition(null), []);

  const onContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      startPoint.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      longPressTimer.current = setTimeout(() => {
        setPosition({ x: e.clientX, y: e.clientY });
      }, LONG_PRESS_MS);
    },
    [clearTimer],
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
