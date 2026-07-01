import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Volume2, Eye } from 'lucide-react';
import { CircularProgressRing } from '../ui/CircularProgressRing';

interface VideoNotePlayerProps {
  src: string;
  durationSeconds?: number;
}

const SIZE         = 200;  // circle diameter, px
const RING_PADDING = 5;    // ring outside the circle rim
const OUTER        = SIZE + RING_PADDING * 2;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function VideoNotePlayer({ src, durationSeconds }: VideoNotePlayerProps) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const wrapperRef    = useRef<HTMLButtonElement>(null);

  const [playing,     setPlaying]  = useState(false);
  const [muted,       setMuted]    = useState(true);   // silent until user taps
  const [viewed,      setViewed]   = useState(false);
  const [currentTime, setCurrent]  = useState(0);
  const [duration,    setDuration] = useState(durationSeconds ?? 0);

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
    const onEnded = () => { setPlaying(false); setCurrent(0); setViewed(true); };
    const onPause = () => setPlaying(false);
    const onPlay  = () => setPlaying(true);

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('ended',  onEnded);
    v.addEventListener('pause',  onPause);
    v.addEventListener('play',   onPlay);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('ended',  onEnded);
      v.removeEventListener('pause',  onPause);
      v.removeEventListener('play',   onPlay);
    };
  }, []);

  // ── Auto-play muted when video enters the viewport (≥60%) ──────
  const autoplayRef = useRef(false);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const v       = videoRef.current;
    if (!wrapper || !v) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries[0].isIntersecting;
        if (visible && !autoplayRef.current && !playing) {
          autoplayRef.current = true;
          v.muted    = true;
          v.currentTime = 0;
          v.play().catch(() => { /* iOS may block — silently ignore */ });
        } else if (!visible && v.muted) {
          // Muted autoplay — pause when scrolled away
          v.pause();
          v.currentTime = 0;
          autoplayRef.current = false;
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(wrapper);
    return () => obs.disconnect();
  }, [playing]);

  // ── Tap handler ─────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    if (v.muted) {
      // First real tap: restart from beginning with sound
      v.muted       = false;
      v.currentTime = 0;
      setMuted(false);
      v.play().catch(() => { v.muted = false; });
    } else if (playing) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, [playing]);

  const progress  = duration > 0 ? currentTime / duration : 0;
  const remaining = Math.max(0, duration - currentTime);
  const nearEnd   = duration > 0 && remaining < 10;

  return (
    <button
      ref={wrapperRef}
      onClick={handleTap}
      className="relative select-none"
      style={{ width: OUTER, height: OUTER }}
      aria-label="Видео-сообщение"
    >
      {/* Circular progress ring */}
      <CircularProgressRing
        progress={progress}
        size={OUTER}
        strokeWidth={3}
        className={nearEnd ? 'text-red-400' : 'text-accent'}
        trackClassName="text-border"
      />

      {/* Video clipped to circle */}
      <span
        className="absolute overflow-hidden rounded-full bg-black"
        style={{ inset: RING_PADDING, width: SIZE, height: SIZE }}
      >
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-cover"
          playsInline
          preload="metadata"
        />

        {/* Play overlay — shown when paused/idle */}
        {!playing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-150">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
              {muted
                ? <Volume2 size={22} className="text-white drop-shadow" />
                : <Play    size={22} className="fill-white text-white drop-shadow" />
              }
            </span>
          </span>
        )}

        {/* Duration / remaining */}
        <span className="absolute bottom-2 right-2.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {fmt(playing || currentTime > 0 ? remaining : duration)}
        </span>

        {/* "Viewed" badge */}
        {viewed && !playing && (
          <span className="absolute bottom-2 left-2.5 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
            <Eye size={10} />
          </span>
        )}
      </span>
    </button>
  );
}
