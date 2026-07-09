import { AlertCircle, RotateCw } from 'lucide-react';
import { CircularProgressRing } from '../ui/CircularProgressRing';
import type { MediaUploadState } from '../../hooks/useMessages';

interface MediaUploadOverlayProps {
  upload: MediaUploadState;
  rounded?: string;
}

const BADGE = 40;

// Dark scrim + progress ring/error over a media preview — used by image and
// file bubbles. Media types with their own player (voice, video note) render
// upload state inline instead, see AudioPlayer/VideoNotePlayer.
export function MediaUploadOverlay({ upload, rounded = 'rounded-lg' }: MediaUploadOverlayProps) {
  if (upload.status === 'error') {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          upload.retry();
        }}
        className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-white transition hover:bg-black/60 ${rounded}`}
      >
        <AlertCircle size={22} />
        <span className="flex items-center gap-1 text-xs font-medium">
          <RotateCw size={12} /> Повторить
        </span>
      </button>
    );
  }

  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-black/40 ${rounded}`}>
      <div className="relative flex items-center justify-center" style={{ width: BADGE, height: BADGE }}>
        <CircularProgressRing progress={upload.progress} size={BADGE} strokeWidth={3} className="text-white" trackClassName="text-white/25" />
        <span className="text-[10px] font-semibold text-white">{Math.round(upload.progress * 100)}%</span>
      </div>
    </div>
  );
}
