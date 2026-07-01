import { useRef, useState, useCallback, useEffect } from 'react';
import { MAX_VIDEO_NOTE_DURATION_SECONDS } from '../config';

// iOS Safari supports video/mp4 but not video/webm — list mp4 first.
const CANDIDATE_MIME_TYPES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

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

export function useVideoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const startTimeRef  = useRef(0);
  const rafRef        = useRef<number | null>(null);

  const startingRef    = useRef(false);
  const pendingStopRef = useRef(false);

  const onMaxDurationRef = useRef<(() => Promise<void>) | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
    recorderRef.current = null;
    startingRef.current = false;
    pendingStopRef.current = false;
    setIsRecording(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    startingRef.current = true;
    pendingStopRef.current = false;
    chunksRef.current = [];

    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: true,
      });
    } catch {
      startingRef.current = false;
      setError('Нет доступа к камере. Разрешите его в настройках браузера.');
      return;
    }

    if (pendingStopRef.current) {
      mediaStream.getTracks().forEach((t) => t.stop());
      startingRef.current = false;
      return;
    }

    setStream(mediaStream);

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start();
    startingRef.current = false;

    startTimeRef.current = Date.now();
    setIsRecording(true);

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedSeconds(elapsed);
      if (elapsed >= MAX_VIDEO_NOTE_DURATION_SECONDS) {
        void onMaxDurationRef.current?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [cleanup]);

  const stop = useCallback((): Promise<RecordedVideo | null> => {
    return new Promise((resolve) => {
      if (startingRef.current) {
        pendingStopRef.current = true;
        resolve(null);
        return;
      }

      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanup();
        resolve(null);
        return;
      }

      const mimeType = recorder.mimeType || 'video/mp4';
      const durationSeconds = (Date.now() - startTimeRef.current) / 1000;

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        resolve(blob.size > 0 ? { blob, durationSeconds, mimeType } : null);
      };
      recorder.stop();
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    if (startingRef.current) {
      pendingStopRef.current = true;
      return;
    }
    recorderRef.current?.stop();
    cleanup();
  }, [cleanup]);

  return {
    isRecording,
    elapsedSeconds,
    stream,
    error,
    start,
    stop,
    cancel,
    maxDurationSeconds: MAX_VIDEO_NOTE_DURATION_SECONDS,
    onMaxDurationRef,
  };
}
