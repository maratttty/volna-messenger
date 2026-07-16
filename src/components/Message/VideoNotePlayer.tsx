import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Volume2, Eye, X, Square } from 'lucide-react';
import { CircularProgressRing } from '../ui/CircularProgressRing';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useIsMobile } from '../../hooks/useIsMobile';

interface VideoNotePlayerProps {
  src: string;
  durationSeconds?: number;
  messageId: string;
  senderName: string;
  posterUrl?: string;
  uploadProgress?: number; // 0..1, only set while this message's attachment is still uploading
  onCancelUpload?: () => void;
}

const SIZE         = 240;
const RING_PADDING = 5;
const OUTER        = SIZE + RING_PADDING * 2;

// Mobile only — how much the circle grows once the user taps to actually
// play it (states b/c in the spec below).
const EXPANDED_SCALE = 1.45;
const EXPANDED_OUTER = OUTER * EXPANDED_SCALE;

// The video circle and scrub bar are sized in % of the wrapper rather than
// fixed px — see the width/height transition on the wrapper below. Keeping
// them as a percentage of the same box that's actually transitioning is what
// makes the video, ring padding and scrub bar all grow in lockstep with the
// one CSS transition, instead of needing a second, separately-timed animation.
const RING_INSET_PCT = (RING_PADDING / OUTER) * 100;

// Mobile only — the scrub bar overlay (state c). Inset far enough from the
// edges that it stays inside the circular clip at this vertical position
// (chord width shrinks near the bottom of a circle) instead of getting cut
// off by the rounded-full mask around the video. Expressed as % of the video
// circle (SIZE) so it stays correctly placed at the expanded size too.
const SEEK_BAR_INSET_PCT  = (40 / SIZE) * 100;
const SEEK_BAR_BOTTOM_PCT = (38 / SIZE) * 100;

// Mobile "not playing" state — three interaction states beyond idle:
//  idle             -> (a) thin buffered-progress ring, tap starts playback
//  expanded-playing -> (b) scaled up, playing
//  expanded-paused  -> (c) scaled up, paused, scrub bar + stop button shown
type MobileState = 'idle' | 'expanded-playing' | 'expanded-paused';

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function VideoNotePlayer({ src, durationSeconds, messageId, senderName, posterUrl, uploadProgress, onCancelUpload }: VideoNotePlayerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();

  const [playing,     setPlaying]  = useState(false);
  const [localMuted,  setLocalMuted] = useState(true);
  const [viewed,      setViewed]   = useState(false);
  const [currentTime, setCurrent]  = useState(0);
  const [duration,    setDuration] = useState(durationSeconds ?? 0);
  const [mobileState, setMobileState] = useState<MobileState>('idle');
  // How much of the video is actually downloaded/playable so far — drives
  // the idle-state ring (state a). Real data from the <video> element's
  // buffered ranges, not a decorative animation.
  const [bufferedFraction, setBufferedFraction] = useState(0);
  // True once the video has an actual decoded frame to show. Browsers hide
  // the native `poster` attribute as soon as play() is *called*, even before
  // any frame data has arrived — autoplay-on-mount then races the network
  // and paints black until data catches up. We render our own poster <img>
  // on top and only drop it once a real frame is confirmed, so there's never
  // a black gap regardless of that native timing quirk.
  const [frameReady,  setFrameReady] = useState(false);

  // A different src (pending blob URL → confirmed server URL) means a fresh
  // video load — reset so the poster covers the new buffering gap too.
  useEffect(() => {
    setFrameReady(false);
    setBufferedFraction(0);
  }, [src]);

  const isActive   = usePlaybackStore(s => s.messageId === messageId);
  const isPending  = usePlaybackStore(s => s.pendingPlay === messageId);
  const activate   = usePlaybackStore(s => s.activate);
  const deactivate = usePlaybackStore(s => s.deactivate);
  const storeSetPlaying = usePlaybackStore(s => s.setPlaying);
  const setPending = usePlaybackStore(s => s.setPendingPlay);

  // effectiveMuted: use store muted when active (panel can toggle it), local otherwise
  const storeMuted = usePlaybackStore(s => s.muted);
  const effectiveMuted = isActive ? storeMuted : localMuted;

  // ── Smooth progress via RAF ─────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    let id: number;
    const tick = () => {
      const v = videoRef.current;
      if (v) setCurrent(v.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  // ── Video events ────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onMeta  = () => { if (Number.isFinite(v.duration)) setDuration(v.duration); };
    const onFrame = () => setFrameReady(true);
    const onBuffered = () => {
      if (v.buffered.length === 0 || !Number.isFinite(v.duration) || v.duration === 0) return;
      setBufferedFraction(Math.min(1, v.buffered.end(v.buffered.length - 1) / v.duration));
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      setViewed(true);
      setMobileState('idle');
      if (usePlaybackStore.getState().messageId === messageId) deactivate();
    };
    const onPause = () => {
      setPlaying(false);
      if (usePlaybackStore.getState().messageId === messageId) storeSetPlaying(false);
    };
    const onPlay  = () => {
      setPlaying(true);
      if (usePlaybackStore.getState().messageId === messageId) storeSetPlaying(true);
    };

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('loadeddata', onFrame);
    v.addEventListener('playing', onFrame);
    v.addEventListener('progress', onBuffered);
    v.addEventListener('canplay', onBuffered);
    v.addEventListener('ended',  onEnded);
    v.addEventListener('pause',  onPause);
    v.addEventListener('play',   onPlay);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('loadeddata', onFrame);
      v.removeEventListener('playing', onFrame);
      v.removeEventListener('progress', onBuffered);
      v.removeEventListener('canplay', onBuffered);
      v.removeEventListener('ended',  onEnded);
      v.removeEventListener('pause',  onPause);
      v.removeEventListener('play',   onPlay);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset muted + mobile expand state when deactivated so next tap
  //    re-enters activate() / starts from the idle circle again ──────
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      setLocalMuted(true);
      setMobileState('idle');
      const v = videoRef.current;
      if (v) v.muted = true;
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  // ── Deactivate store on unmount if active ──────────────────────
  useEffect(() => {
    return () => {
      if (usePlaybackStore.getState().messageId === messageId) {
        usePlaybackStore.getState().deactivate();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-start when prev/next triggers this player ─────────────
  useEffect(() => {
    if (!isPending || !videoRef.current) return;
    const v = videoRef.current;
    v.muted       = false;
    v.currentTime = 0;
    setLocalMuted(false);
    activate(messageId, 'video_note', senderName, v);
    setPending(null);
    if (isMobile) setMobileState('expanded-playing');
    v.play().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  // ── Auto-play muted when video enters the viewport (≥60%) ──────
  const autoplayRef = useRef(false);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const v       = videoRef.current;
    if (!wrapper || !v) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // Never autoplay while the attachment is still uploading — it's
        // showing the local blob and would fight with the cancel (X) tap target.
        if (uploadProgress !== undefined && uploadProgress < 1) return;
        const visible = entries[0].isIntersecting;
        if (visible && !autoplayRef.current && !playing) {
          autoplayRef.current = true;
          v.muted    = true;
          v.currentTime = 0;
          v.play().catch(() => {});
        } else if (!visible && v.muted) {
          v.pause();
          v.currentTime = 0;
          autoplayRef.current = false;
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(wrapper);
    return () => obs.disconnect();
  }, [playing, uploadProgress]);

  // ── Desktop tap handler — unchanged: click plays instantly in place ──
  const handleDesktopTap = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    if (v.muted) {
      // First real tap: restart from beginning with sound
      v.muted       = false;
      v.currentTime = 0;
      setLocalMuted(false);
      activate(messageId, 'video_note', senderName, v);
      v.play().catch(() => { v.muted = false; });
    } else if (playing) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, [playing, activate, messageId, senderName]);

  // ── Mobile tap handler — idle -> expanded-playing -> expanded-paused ──
  // State flips synchronously here regardless of whether the video has
  // buffered enough to actually start yet, so the tap always feels instant.
  const handleMobileTap = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    if (mobileState === 'idle') {
      v.muted       = false;
      v.currentTime = 0;
      setLocalMuted(false);
      activate(messageId, 'video_note', senderName, v);
      setMobileState('expanded-playing');
      v.play().catch(() => {});
    } else if (mobileState === 'expanded-playing') {
      setMobileState('expanded-paused');
      v.pause();
    } else {
      // expanded-paused, tap on the video body (not stop, not the scrub
      // bar) — resume, same as any media player's tap-to-toggle.
      setMobileState('expanded-playing');
      v.play().catch(() => {});
    }
  }, [mobileState, activate, messageId, senderName]);

  const handleStop = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setCurrent(0);
    setMobileState('idle');
  }, []);

  const seekFromClientX = useCallback((clientX: number) => {
    const el = seekBarRef.current;
    const v  = videoRef.current;
    if (!el || !v || !duration) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = frac * duration;
    setCurrent(v.currentTime);
  }, [duration]);

  const handleSeekPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  }, [seekFromClientX]);

  const handleSeekPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    e.stopPropagation();
    seekFromClientX(e.clientX);
  }, [seekFromClientX]);

  const uploading = uploadProgress !== undefined && uploadProgress < 1;

  const handleClick = useCallback(() => {
    if (uploading && onCancelUpload) { onCancelUpload(); return; }
    if (isMobile) handleMobileTap(); else handleDesktopTap();
  }, [uploading, onCancelUpload, isMobile, handleMobileTap, handleDesktopTap]);

  const progress  = duration > 0 ? currentTime / duration : 0;
  const remaining = Math.max(0, duration - currentTime);
  const expanded  = isMobile && mobileState !== 'idle';

  return (
    <div
      ref={wrapperRef}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      className="relative select-none transition-[width,height] duration-200 ease-out"
      style={{
        width: expanded ? EXPANDED_OUTER : OUTER,
        height: expanded ? EXPANDED_OUTER : OUTER,
      }}
      aria-label="Видео-сообщение"
    >
      {/* Playback ring (desktop only — mobile uses the buffered ring below
          at rest, and the scrub bar once expanded, per the mobile spec). */}
      {!isMobile && !uploading && !effectiveMuted && (
        <CircularProgressRing
          progress={progress}
          size={OUTER}
          strokeWidth={3}
          className="text-accent/70"
        />
      )}

      {/* Mobile idle state (a) — thin, subtle ring showing real buffered
          (download) progress, not decorative. */}
      {isMobile && mobileState === 'idle' && !uploading && (
        <CircularProgressRing
          progress={bufferedFraction}
          size={OUTER}
          strokeWidth={2.5}
          className="text-white/45"
          trackClassName="text-white/10"
          smooth
        />
      )}

      {/* Video clipped to circle */}
      <span
        className="absolute overflow-hidden rounded-full bg-black"
        style={{ inset: `${RING_INSET_PCT}%` }}
      >
        <video
          ref={videoRef}
          src={src}
          poster={posterUrl}
          className="h-full w-full object-cover"
          playsInline
          preload="metadata"
        />

        {/* Own poster overlay — covers the native black-before-first-frame gap
            that the `poster` attribute above doesn't reliably cover once
            play() has been called (autoplay-on-visible fires immediately). */}
        {!frameReady && posterUrl && (
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Cancel overlay while uploading — ring wraps the X itself, matching
            the voice-message cancel button, not the whole circle. Otherwise
            the usual play overlay. */}
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
              <CircularProgressRing progress={uploadProgress} size={56} strokeWidth={3} className="text-white" trackClassName="text-white/30" spinning />
              <X size={24} className="text-white drop-shadow" />
            </span>
          </span>
        ) : (
          !playing && (!isMobile || mobileState === 'idle') && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-150">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40">
                {effectiveMuted
                  ? <Volume2 size={22} className="text-white drop-shadow" />
                  : <Play    size={22} className="fill-white text-white drop-shadow" />
                }
              </span>
            </span>
          )
        )}

        {/* Mobile state (c) — scrub bar + stop button, shown once the
            user's second tap pauses the enlarged playback. */}
        {isMobile && mobileState === 'expanded-paused' && (
          <span
            className="absolute inset-0 flex items-center justify-center bg-black/45"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleStop}
              aria-label="Остановить"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition active:scale-90"
            >
              <Square size={18} className="fill-white" />
            </button>
            <div
              ref={seekBarRef}
              onPointerDown={handleSeekPointerDown}
              onPointerMove={handleSeekPointerMove}
              className="absolute h-4 cursor-pointer touch-none"
              style={{
                left: `${SEEK_BAR_INSET_PCT}%`,
                right: `${SEEK_BAR_INSET_PCT}%`,
                bottom: `calc(${SEEK_BAR_BOTTOM_PCT}% - 6px)`,
              }}
            >
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
              </div>
              <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </span>
        )}

        {/* Duration / remaining, or upload % while sending — hidden once
            expanded on mobile, the scrub bar takes over that role. */}
        {(!isMobile || mobileState === 'idle') && (
          <span className="absolute bottom-2 right-2.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {uploading ? `${Math.round(uploadProgress * 100)}%` : fmt(playing || currentTime > 0 ? remaining : duration)}
          </span>
        )}

        {/* "Viewed" badge */}
        {viewed && !playing && (!isMobile || mobileState === 'idle') && (
          <span className="absolute bottom-2 left-2.5 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
            <Eye size={10} />
          </span>
        )}
      </span>
    </div>
  );
}
