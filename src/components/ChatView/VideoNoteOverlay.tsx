import { useRef, useEffect, useState } from 'react';
import { Trash2, Send, Flashlight, FlashlightOff, ChevronLeft, ArrowUp, Lock } from 'lucide-react';
import { CircularProgressRing } from '../ui/CircularProgressRing';

const CIRCLE_SIZE = 260;
const RING_WIDTH  = 5;
const OUTER_SIZE  = CIRCLE_SIZE + RING_WIDTH * 2;

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface VideoNoteOverlayProps {
  stream: MediaStream | null;
  elapsedSeconds: number;
  maxDurationSeconds: number;
  /** 0–1 — how far the user has dragged toward cancel */
  cancelProgress: number;
  locked: boolean;
  onCancel: () => void;       // cancel while NOT locked (no button shown — swipe only)
  onCancelLocked: () => void; // cancel button in locked mode
  onSendLocked: () => void;   // send button in locked mode
}

export function VideoNoteOverlay({
  stream,
  elapsedSeconds,
  maxDurationSeconds,
  cancelProgress,
  locked,
  onCancelLocked,
  onSendLocked,
}: VideoNoteOverlayProps) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      el.srcObject = stream;
      // Ensure playback starts even if browser defers autoplay
      void el.play().catch(() => {/* Safari may throw — ignore */});
    }
  }, [stream]);

  const progress    = elapsedSeconds / maxDurationSeconds;
  const nearEnd     = elapsedSeconds > maxDurationSeconds - 10;
  const nearCancel  = cancelProgress > 0.5;

  // When user swipes toward cancel, shift the circle a bit to reflect it
  const circleShift = cancelProgress * -32;

  // Backdrop tints red when user swipes toward cancel
  const bgColor = flash
    ? 'rgba(255,255,255,0.97)'
    : nearCancel
      ? `rgba(${Math.round(80 + cancelProgress * 80)},0,0,0.82)`
      : 'rgba(0,0,0,0.82)';

  return (
    <div
      className="anim-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center transition-colors duration-150"
      style={{ background: bgColor }}
    >
      {/* ── Swipe hints (hidden in locked mode) ─────────────────────── */}
      {!locked && (
        <div className="mb-6 flex items-center gap-6 text-xs text-white/60 select-none">
          <span className="flex items-center gap-1">
            <ArrowUp size={13} />
            Свайп вверх — фиксация
          </span>
          <span className={`flex items-center gap-1 transition-colors ${nearCancel ? 'text-red-400' : ''}`}>
            <ChevronLeft size={13} />
            Свайп влево — отмена
          </span>
        </div>
      )}

      {locked && (
        <div className="mb-6 flex items-center gap-2 text-sm text-accent select-none">
          <Lock size={15} />
          Запись зафиксирована
        </div>
      )}

      {/* ── Circle preview ────────────────────────────────────────────── */}
      <div
        className="relative select-none"
        style={{
          width:  OUTER_SIZE,
          height: OUTER_SIZE,
          transform: `translateX(${circleShift}px)`,
          transition: 'transform 0.05s linear',
        }}
      >
        {/* Progress ring */}
        <CircularProgressRing
          progress={progress}
          size={OUTER_SIZE}
          strokeWidth={RING_WIDTH}
          className={nearEnd ? 'text-red-400' : nearCancel ? 'text-red-400' : 'text-accent'}
          trackClassName="text-white/30"
        />

        {/* Camera circle */}
        <div
          className="absolute overflow-hidden rounded-full bg-black"
          style={{ inset: RING_WIDTH, width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover scale-x-[-1]"
          />
        </div>

        {/* Recording pulse dot */}
        <span
          className="absolute top-4 right-4 h-3 w-3 rounded-full bg-red-500 animate-pulse"
          style={{ zIndex: 1 }}
        />
      </div>

      {/* ── Timer ─────────────────────────────────────────────────────── */}
      <div className="mt-5 flex items-baseline gap-1 select-none">
        <span className={`text-3xl font-mono font-medium tabular-nums ${nearEnd ? 'text-red-400' : 'text-white'}`}>
          {formatTimer(elapsedSeconds)}
        </span>
        <span className="text-sm text-white/40">
          / {formatTimer(maxDurationSeconds)}
        </span>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="mt-8 flex w-72 items-center justify-between">
        {locked ? (
          /* Locked mode: Cancel and Send */
          <>
            <button
              onClick={onCancelLocked}
              className="flex flex-col items-center gap-1.5 text-white/70 transition hover:text-red-400"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                <Trash2 size={22} />
              </span>
              <span className="text-xs">Удалить</span>
            </button>

            <button
              onClick={onSendLocked}
              className="flex flex-col items-center gap-1.5 text-accent transition hover:text-accent-hover"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white">
                <Send size={24} />
              </span>
              <span className="text-xs text-white/70">Отправить</span>
            </button>

            {/* Flash toggle — stays available in locked mode too */}
            <button
              onClick={() => setFlash((f) => !f)}
              className="flex flex-col items-center gap-1.5 transition"
              style={{ color: flash ? '#facc15' : 'rgba(255,255,255,0.7)' }}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                {flash ? <FlashlightOff size={22} /> : <Flashlight size={22} />}
              </span>
              <span className="text-xs">{flash ? 'Выкл. свет' : 'Подсветка'}</span>
            </button>
          </>
        ) : (
          /* Hold mode: only the flash toggle (cancel/send via RecordButton gestures) */
          <>
            <div className="h-14 w-14" /> {/* spacer */}

            <button
              onClick={() => setFlash((f) => !f)}
              className="flex flex-col items-center gap-1.5 transition"
              style={{ color: flash ? '#facc15' : 'rgba(255,255,255,0.7)' }}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                {flash ? <FlashlightOff size={22} /> : <Flashlight size={22} />}
              </span>
              <span className="text-xs">{flash ? 'Выкл. свет' : 'Подсветка'}</span>
            </button>

            <div className="h-14 w-14" /> {/* spacer */}
          </>
        )}
      </div>

      {/* In non-locked hold mode, the RecordButton at bottom still captures gestures */}
      {!locked && (
        <p className="mt-6 text-[11px] text-white/30 select-none">
          Отпустите для отправки
        </p>
      )}
    </div>
  );
}
