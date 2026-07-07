import { useRef, useState, useEffect, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  duration?: number;
}

const BAR_COUNT = 28;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Deterministic pseudo-waveform from the src string — we don't decode the
// actual audio, but a stable per-message bar pattern reads better than a
// plain progress line and doesn't require extra processing on upload.
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

export function AudioPlayer({ src, duration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const barHeights = useMemo(() => generateBarHeights(src), [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // requestAnimationFrame instead of the audio "timeupdate" event — timeupdate
  // only fires a few times a second, which made the waveform fill visibly
  // stutter. rAF reads currentTime every frame for a smooth sweep.
  useEffect(() => {
    if (!playing) return;
    let rafId: number;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setCurrentTime(audio.currentTime);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  const effectiveDuration = audioRef.current?.duration || duration || 0;
  const progress = effectiveDuration > 0 ? currentTime / effectiveDuration : 0;
  const exactBarIndex = progress * BAR_COUNT;

  return (
    <div className="flex w-56 items-center gap-2 py-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-bg"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
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
