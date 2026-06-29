import { useRef, useState, useCallback, useEffect } from 'react';
import { MAX_VIDEO_NOTE_DURATION_SECONDS } from '../config';

const CANDIDATE_MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

function pickMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export interface RecordedVideo {
  blob: Blob;
  durationSeconds: number;
  mimeType: string;
}

// Records a square-ish video clip ("video note") from the front camera.
export function useVideoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const autoStopRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
    recorderRef.current = null;
    setIsRecording(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: true,
      });
      setStream(mediaStream);
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();

      startTimeRef.current = Date.now();
      setIsRecording(true);
      const tick = () => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setElapsedSeconds(elapsed);
        if (elapsed >= MAX_VIDEO_NOTE_DURATION_SECONDS) {
          autoStopRef.current?.();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError('Не удалось получить доступ к камере');
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<RecordedVideo | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      const mimeType = recorder.mimeType;
      const durationSeconds = (Date.now() - startTimeRef.current) / 1000;
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        resolve(blob.size > 0 ? { blob, durationSeconds, mimeType } : null);
      };
      recorder.stop();
    });
  }, [cleanup]);

  autoStopRef.current = () => void stop();

  const cancel = useCallback(() => {
    recorderRef.current?.stop();
    cleanup();
  }, [cleanup]);

  return { isRecording, elapsedSeconds, stream, error, start, stop, cancel, maxDurationSeconds: MAX_VIDEO_NOTE_DURATION_SECONDS };
}
