import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Volume2, Eye, X } from 'lucide-react';
import { CircularProgressRing } from '../ui/CircularProgressRing';
import { usePlaybackStore } from '../../stores/playbackStore';

interface VideoNotePlayerProps {
  src: string;
  durationSeconds?: number;
  messageId: string;
  senderName: string;
  posterUrl?: string;
  uploadProgress?: number; // 0..1, only set while this message's attachment is still uploading
  onCancelUpload?: () => void;
}

const SIZE         = 200;
const RING_PADDING = 5;
const OUTER        = SIZE + RING_PADDING * 2;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function VideoNotePlayer({ src, durationSeconds, messageId, senderName, posterUrl, uploadProgress, onCancelUpload }: VideoNotePlayerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLButtonElement>(null);

  const [playing,     setPlaying]  = useState(false);
  const [localMuted,  setLocalMuted] = useState(true);
  const [viewed,      setViewed]   = useState(false);
  const [currentTime, setCurrent]  = useState(0);
  const [duration,    setDuration] = useState(durationSeconds ?? 0);
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
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      setViewed(true);
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
    v.addEventListener('ended',  onEnded);
    v.addEventListener('pause',  onPause);
    v.addEventListener('play',   onPlay);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('loadeddata', onFrame);
      v.removeEventListener('playing', onFrame);
      v.removeEventListener('ended',  onEnded);
      v.removeEventListener('pause',  onPause);
      v.removeEventListener('play',   onPlay);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset muted when deactivated so next tap re-enters activate() ──
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      setLocalMuted(true);
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

  // ── Tap handler ─────────────────────────────────────────────────
  const handleTap = useCallback(() => {
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

  const progress  = duration > 0 ? currentTime / duration : 0;
  const remaining = Math.max(0, duration - currentTime);
  const uploading = uploadProgress !== undefined && uploadProgress < 1;

  return (
    <button
      ref={wrapperRef}
      onClick={uploading && onCancelUpload ? onCancelUpload : handleTap}
      className="relative select-none"
      style={{ width: OUTER, height: OUTER }}
      aria-label="Видео-сообщение"
    >
      {/* Playback ring only — around the whole circle, same as before. The
          upload ring lives on the small centered cancel button below instead
          (matching the voice-message style), not around the whole circle. */}
      {!uploading && !effectiveMuted && (
        <CircularProgressRing
          progress={progress}
          size={OUTER}
          strokeWidth={3}
          className="text-accent/70"
        />
      )}

      {/* Video clipped to circle */}
      <span
        className="absolute overflow-hidden rounded-full bg-black"
        style={{ inset: RING_PADDING, width: SIZE, height: SIZE }}
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
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
              <CircularProgressRing progress={uploadProgress} size={56} strokeWidth={3} className="text-white" trackClassName="text-white/30" smooth />
              <X size={24} className="text-white drop-shadow" />
            </span>
          </span>
        ) : (
          !playing && (
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

        {/* Duration / remaining, or upload % while sending */}
        <span className="absolute bottom-2 right-2.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {uploading ? `${Math.round(uploadProgress * 100)}%` : fmt(playing || currentTime > 0 ? remaining : duration)}
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
