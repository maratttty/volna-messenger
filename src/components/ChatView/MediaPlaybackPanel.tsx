import { useState, useEffect } from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { usePlaybackStore, SPEEDS } from '../../stores/playbackStore';
import type { Message } from '../../types/database';

interface Props {
  messages: Message[];
  onJumpToMessage: (messageId: string) => void;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function MediaPlaybackPanel({ messages, onJumpToMessage }: Props) {
  const messageId  = usePlaybackStore(s => s.messageId);
  const type       = usePlaybackStore(s => s.type);
  const senderName = usePlaybackStore(s => s.senderName);
  const mediaEl    = usePlaybackStore(s => s.mediaEl);
  const playing    = usePlaybackStore(s => s.playing);
  const speed      = usePlaybackStore(s => s.speed);
  const muted      = usePlaybackStore(s => s.muted);
  const { deactivate, setPlaying, setSpeed, setMuted, setPendingPlay } = usePlaybackStore.getState();

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Sync duration from media element
  useEffect(() => {
    if (!mediaEl) { setCurrentTime(0); setDuration(0); return; }
    const update = () => { if (isFinite(mediaEl.duration)) setDuration(mediaEl.duration); };
    mediaEl.addEventListener('loadedmetadata', update);
    mediaEl.addEventListener('durationchange', update);
    update();
    return () => {
      mediaEl.removeEventListener('loadedmetadata', update);
      mediaEl.removeEventListener('durationchange', update);
    };
  }, [mediaEl]);

  // RAF progress loop
  useEffect(() => {
    if (!playing || !mediaEl) return;
    let id: number;
    const tick = () => {
      setCurrentTime(mediaEl.currentTime);
      if (isFinite(mediaEl.duration)) setDuration(mediaEl.duration);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, mediaEl]);

  if (!messageId || !mediaEl) return null;

  const mediaMessages = messages.filter(m => m.type === 'voice' || m.type === 'video_note');
  const idx     = mediaMessages.findIndex(m => m.id === messageId);
  const prevMsg = idx > 0 ? mediaMessages[idx - 1] : null;
  const nextMsg = idx >= 0 && idx < mediaMessages.length - 1 ? mediaMessages[idx + 1] : null;

  function handlePlayPause() {
    if (!mediaEl) return;
    if (playing) { mediaEl.pause(); setPlaying(false); }
    else { void mediaEl.play(); setPlaying(true); }
  }

  function handlePrev() {
    if (!prevMsg) return;
    setPendingPlay(prevMsg.id);
    onJumpToMessage(prevMsg.id);
  }

  function handleNext() {
    if (!nextMsg) return;
    setPendingPlay(nextMsg.id);
    onJumpToMessage(nextMsg.id);
  }

  function handleSpeed() {
    const i = SPEEDS.indexOf(speed as typeof SPEEDS[number]);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!mediaEl || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
    mediaEl.currentTime = t;
    setCurrentTime(t);
  }

  const progress  = duration > 0 ? currentTime / duration : 0;
  const remaining = Math.max(0, duration - currentTime);

  return (
    <div className="flex w-full shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2">
      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-bg"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>

      {/* Prev / Next */}
      <button
        onClick={handlePrev}
        disabled={!prevMsg}
        className="shrink-0 rounded p-1 text-text-muted transition hover:text-text disabled:opacity-30"
      >
        <SkipBack size={16} />
      </button>
      <button
        onClick={handleNext}
        disabled={!nextMsg}
        className="shrink-0 rounded p-1 text-text-muted transition hover:text-text disabled:opacity-30"
      >
        <SkipForward size={16} />
      </button>

      {/* Info + progress bar */}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-1.5">
          <span className="truncate text-xs font-medium leading-none">{senderName}</span>
          <span className="shrink-0 text-[10px] leading-none text-text-muted">
            {type === 'voice' ? 'Голосовое' : 'Видео'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-[10px] tabular-nums text-text-muted">{fmtTime(currentTime)}</span>
          <div
            className="h-1 flex-1 cursor-pointer rounded-full bg-black/15"
            onClick={handleSeek}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-text-muted">-{fmtTime(remaining)}</span>
        </div>
      </div>

      {/* Speed */}
      <button
        onClick={handleSpeed}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-accent transition hover:bg-surface-hover"
      >
        ×{speed}
      </button>

      {/* Mute */}
      <button
        onClick={() => setMuted(!muted)}
        className="shrink-0 rounded p-1 text-text-muted transition hover:text-text"
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      {/* Close */}
      <button
        onClick={deactivate}
        className="shrink-0 rounded p-1 text-text-muted transition hover:text-text"
      >
        <X size={16} />
      </button>
    </div>
  );
}
