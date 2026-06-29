import { useRef, useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { CircularProgressRing } from '../ui/CircularProgressRing';

interface VideoNotePlayerProps {
  src: string;
  durationSeconds?: number;
}

const SIZE = 192; // video circle diameter
const RING_PADDING = 5; // ring sits just outside the rim, like Telegram

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoNotePlayer({ src, durationSeconds }: VideoNotePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMetadata = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  // requestAnimationFrame instead of "timeupdate" (which fires only a few
  // times a second) — keeps the progress ring sweeping smoothly every frame.
  useEffect(() => {
    if (!playing) return;
    let rafId: number;
    const tick = () => {
      const video = videoRef.current;
      if (video) setCurrentTime(video.currentTime);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      void video.play();
      setPlaying(true);
    }
  }

  const remaining = Math.max(0, duration - currentTime);
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <button
      onClick={toggle}
      className="group relative"
      style={{ width: SIZE + RING_PADDING * 2, height: SIZE + RING_PADDING * 2 }}
    >
      <CircularProgressRing progress={progress} size={SIZE + RING_PADDING * 2} strokeWidth={3} />
      <span
        className="absolute overflow-hidden rounded-full"
        style={{ inset: RING_PADDING, width: SIZE, height: SIZE }}
      >
        <video ref={videoRef} src={src} className="h-full w-full object-cover" playsInline />
        {!playing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/15">
            <Play size={36} className="fill-white text-white drop-shadow" />
          </span>
        )}
        <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">
          {formatDuration(playing || currentTime > 0 ? remaining : duration)}
        </span>
      </span>
    </button>
  );
}
