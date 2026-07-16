import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Mic, Video, Lock, Square } from 'lucide-react';
import { useAudioLevel } from '../../hooks/useAudioLevel';

const HOLD_THRESHOLD_MS = 200;
export const CANCEL_THRESHOLD_PX = 80;
export const LOCK_THRESHOLD_PX = 60;

interface RecordButtonProps {
  mode: 'voice' | 'video';
  locked: boolean;
  stream: MediaStream | null;
  onToggleMode: () => void;
  onHoldStart: () => void;
  onHoldMove: (deltaX: number, deltaY: number) => void;
  onHoldEnd: (canceled: boolean) => void;
  onLock: () => void;
  onSendLocked: () => void;
  disabled?: boolean;
}

export function RecordButton({
  mode,
  locked,
  stream,
  onToggleMode,
  onHoldStart,
  onHoldMove,
  onHoldEnd,
  onLock,
  onSendLocked,
  disabled,
}: RecordButtonProps) {
  const [holding, setHolding] = useState(false);
  // Live mic level for the Siri-style halo below — cheap to call
  // unconditionally, useAudioLevel no-ops (level 0, no AudioContext) while
  // stream is null (idle, or locked/video mode where the halo isn't shown).
  const level = useAudioLevel(holding ? stream : null);
  const [lockHint, setLockHint] = useState(0); // 0..1, how close to locking
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastDeltaXRef = useRef(0);
  const holdingRef = useRef(false);

  function resetGesture() {
    holdingRef.current = false;
    setHolding(false);
    setLockHint(0);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lastDeltaXRef.current = 0;

    holdTimerRef.current = setTimeout(() => {
      holdingRef.current = true;
      setHolding(true);
      onHoldStart();
    }, HOLD_THRESHOLD_MS);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!holdingRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;
    lastDeltaXRef.current = deltaX;
    onHoldMove(deltaX, deltaY);

    const upward = Math.max(0, -deltaY);
    setLockHint(Math.min(1, upward / LOCK_THRESHOLD_PX));

    if (upward >= LOCK_THRESHOLD_PX) {
      // Hands-free from here — recording continues regardless of pointer
      // events, so stop tracking this gesture entirely.
      resetGesture();
      onLock();
    }
  }

  function endHold() {
    const wasHolding = holdingRef.current;
    resetGesture();

    if (wasHolding) {
      onHoldEnd(lastDeltaXRef.current <= -CANCEL_THRESHOLD_PX);
    } else {
      onToggleMode();
    }
  }

  function handlePointerUp() {
    endHold();
  }

  function handlePointerCancel() {
    if (holdingRef.current) onHoldEnd(true); // interrupted — discard, don't send
    resetGesture();
  }

  if (locked) {
    return (
      <button
        onClick={onSendLocked}
        title="Остановить и отправить"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition hover:bg-accent-hover"
      >
        <Square size={16} className="fill-bg" />
      </button>
    );
  }

  const Icon = mode === 'voice' ? Mic : Video;

  return (
    <div className="relative">
      {holding && (
        <span
          className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center justify-center rounded-full bg-surface-hover p-1.5 text-text-muted transition-opacity"
          style={{ opacity: 0.4 + lockHint * 0.6 }}
        >
          <Lock size={14} />
        </span>
      )}
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        disabled={disabled}
        title={mode === 'voice' ? 'Голосовое сообщение (тап — сменить на видео)' : 'Видео-кружок (тап — сменить на голос)'}
        className={`relative flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition ${
          holding ? 'scale-110 bg-red-500 text-white' : 'bg-accent text-bg hover:bg-accent-hover'
        } disabled:opacity-50`}
        style={{ touchAction: 'none' }}
      >
        {/* Siri-style halo — reacts to live mic level, expands/fades with
            volume. Same size as the button at silence (invisible), grows
            and brightens as the user speaks. Smoothed by the CSS transition
            rather than snapping to each ~16ms level reading. */}
        {holding && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-white blur-[2px] transition-[transform,opacity] duration-100 ease-out"
            style={{
              width: 40,
              height: 40,
              transform: `translate(-50%, -50%) scale(${1 + level * 1.3})`,
              opacity: Math.min(0.55, level * 0.7),
            }}
          />
        )}
        <Icon size={18} className="relative z-10" />
      </button>
    </div>
  );
}
