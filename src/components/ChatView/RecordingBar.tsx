import { ChevronLeft, Lock, Trash2 } from 'lucide-react';
import { useAudioLevel } from '../../hooks/useAudioLevel';

interface RecordingBarProps {
  elapsedSeconds: number;
  maxDurationSeconds: number;
  cancelProgress: number;
  locked: boolean;
  onCancelLocked: () => void;
  audioStream: MediaStream | null;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const LEVEL_BAR_COUNT = 20;

function LevelBars({ stream }: { stream: MediaStream | null }) {
  const level = useAudioLevel(stream);
  return (
    <div className="flex h-6 flex-1 items-center gap-[2px]">
      {Array.from({ length: LEVEL_BAR_COUNT }).map((_, i) => {
        const distanceFromCenter = Math.abs(i - LEVEL_BAR_COUNT / 2) / (LEVEL_BAR_COUNT / 2);
        const sensitivity = 1 - distanceFromCenter * 0.4;
        const height = Math.max(3, level * sensitivity * 24);
        return (
          <span
            key={i}
            className="w-[2px] flex-1 rounded-full bg-accent transition-[height] duration-75"
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
}

export function RecordingBar({
  elapsedSeconds,
  maxDurationSeconds,
  cancelProgress,
  locked,
  onCancelLocked,
  audioStream,
}: RecordingBarProps) {
  const nearCancel = cancelProgress > 0.5;

  return (
    <div
      className="flex items-center gap-3 px-1"
      style={
        locked
          ? undefined
          : { transform: `translateX(${-cancelProgress * 24}px)`, opacity: 1 - cancelProgress * 0.5 }
      }
    >
      {locked && (
        <button
          onClick={onCancelLocked}
          title="Удалить запись"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-hover hover:text-red-400"
        >
          <Trash2 size={16} />
        </button>
      )}

      <span className="flex items-center gap-2 text-sm text-red-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
        {formatTimer(elapsedSeconds)}
      </span>

      <LevelBars stream={audioStream} />

      {locked ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
          <Lock size={14} />
          Закреплено
        </span>
      ) : (
        <span className={`flex shrink-0 items-center gap-1 text-xs ${nearCancel ? 'text-red-400' : 'text-text-muted'}`}>
          <ChevronLeft size={14} />
          {nearCancel ? 'Отпустите для отмены' : 'Свайп для отмены'}
        </span>
      )}

      {elapsedSeconds > maxDurationSeconds - 10 && (
        <span className="shrink-0 text-xs text-red-400">{Math.ceil(maxDurationSeconds - elapsedSeconds)}с</span>
      )}
    </div>
  );
}
