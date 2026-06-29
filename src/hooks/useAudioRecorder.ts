import { useRef, useState, useCallback, useEffect } from 'react';
import { MAX_VOICE_DURATION_SECONDS } from '../config';

const CANDIDATE_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export interface RecordedAudio {
  blob: Blob;
  durationSeconds: number;
  mimeType: string;
}

export function useAudioRecorder() {
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
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        if (elapsed >= MAX_VOICE_DURATION_SECONDS) {
          autoStopRef.current?.();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError('Не удалось получить доступ к микрофону');
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
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

  return {
    isRecording,
    elapsedSeconds,
    stream,
    error,
    start,
    stop,
    cancel,
    maxDurationSeconds: MAX_VOICE_DURATION_SECONDS,
  };
}
