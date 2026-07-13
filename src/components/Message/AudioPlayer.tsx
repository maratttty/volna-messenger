import { useRef, useState, useEffect, useMemo } from 'react';
import { Play, Pause, X } from 'lucide-react';
import { usePlaybackStore } from '../../stores/playbackStore';
import { CircularProgressRing } from '../ui/CircularProgressRing';

interface AudioPlayerProps {
  src: string;
  duration?: number;
  messageId: string;
  senderName: string;
  uploadProgress?: number; // 0..1, only set while this message's attachment is still uploading
  onCancelUpload?: () => void;
}

const BAR_COUNT = 28;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateBarHeights(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const heights: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    heights.push(0.3 + (hash % 100) / 100 * 0.7);
  }
  return heights;
}

export function AudioPlayer({ src, duration, messageId, senderName, uploadProgress, onCancelUpload }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const barHeights = useMemo(() => generateBarHeights(src), [src]);

  const isActive    = usePlaybackStore(s => s.messageId === messageId);
  const playing     = usePlaybackStore(s => s.messageId === messageId && s.playing);
  const isPending   = usePlaybackStore(s => s.pendingPlay === messageId);
  const activate    = usePlaybackStore(s => s.activate);
  const deactivate  = usePlaybackStore(s => s.deactivate);
  const setPlaying  = usePlaybackStore(s => s.setPlaying);
  const setPending  = usePlaybackStore(s => s.setPendingPlay);

  // Auto-start when prev/next triggers this player
  useEffect(() => {
    if (!isPending || !audioRef.current) return;
    const audio = audioRef.current;
    activate(messageId, 'voice', senderName, audio);
    setPending(null);
    void audio.play();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  // Deactivate store on unmount if we were active
  useEffect(() => {
    return () => {
      if (usePlaybackStore.getState().messageId === messageId) {
        usePlaybackStore.getState().deactivate();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio native events → keep store in sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      setCurrentTime(0);
      if (usePlaybackStore.getState().messageId === messageId) deactivate();
    };
    const onPause = () => {
      if (usePlaybackStore.getState().messageId === messageId) setPlaying(false);
    };
    const onPlay = () => {
      if (usePlaybackStore.getState().messageId === messageId) setPlaying(true);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RAF → update local waveform progress
  useEffect(() => {
    if (!isActive || !playing) return;
    let rafId: number;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setCurrentTime(audio.currentTime);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, playing]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isActive && playing) {
      audio.pause();
      setPlaying(false);
    } else {
      activate(messageId, 'voice', senderName, audio);
      void audio.play();
    }
  }

  const el = audioRef.current;
  const effectiveDuration = (el && isFinite(el.duration)) ? el.duration : (duration ?? 0);
  const progress = effectiveDuration > 0 ? currentTime / effectiveDuration : 0;
  const exactBarIndex = progress * BAR_COUNT;
  const uploading = uploadProgress !== undefined && uploadProgress < 1;

  return (
    <div className="flex w-56 items-center gap-2 py-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="relative h-9 w-9 shrink-0">
        {uploading && onCancelUpload ? (
          <button
            onClick={onCancelUpload}
            aria-label="Отменить загрузку"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
          >
            <CircularProgressRing progress={uploadProgress} size={36} strokeWidth={2.5} className="text-white" trackClassName="text-white/30" smooth spinning />
            <X size={16} />
          </button>
        ) : (
          <button
            onClick={toggle}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-bg"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
      </div>
      <div className="flex flex-1 items-end gap-[2px]">
        {barHeights.map((h, i) => {
          const fill = Math.max(0, Math.min(1, exactBarIndex - i));
          return (
            <span
              key={i}
              className="relative w-[2px] flex-1 rounded-full bg-black/20"
              style={{ height: `${h * 18}px` }}
            >
              <span
                className="absolute inset-x-0 bottom-0 rounded-full bg-accent"
                style={{ height: `${fill * 100}%` }}
              />
            </span>
          );
        })}
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-text-muted">
        {formatDuration(playing || currentTime > 0 ? currentTime : duration ?? 0)}
      </span>
    </div>
  );
}
