import { useRef, useState, useCallback, useEffect } from 'react';
import { MAX_VOICE_DURATION_SECONDS } from '../config';

// Preference order: AAC in MP4 first (Safari + Chrome 108+ on Mac/iOS),
// then webm/opus (Chrome/Firefox on Windows/Linux/Android),
// then plain mp4/webm as fallbacks, then ogg for Firefox.
const CANDIDATE_MIME_TYPES = [
  'audio/mp4;codecs=mp4a.40.2', // AAC-LC — Safari, Chrome 108+ Mac
  'audio/mp4',                   // AAC generic — Safari, iOS
  'audio/webm;codecs=opus',      // Opus/WebM — Chrome, Firefox (non-Mac)
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

// Voice is intelligible speech, not music — 32kbps mono is plenty (this is
// roughly what WhatsApp-style voice notes use) and cuts upload size/time by
// several times versus the browser's unspecified default bitrate.
const VOICE_BITRATE_BPS = 32_000;

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

  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const startTimeRef  = useRef(0);
  const rafRef        = useRef<number | null>(null);

  // Race-condition flags: stop() may arrive before getUserMedia resolves.
  const startingRef     = useRef(false); // true while getUserMedia is in flight
  const pendingStopRef  = useRef(false); // stop() was called during startup

  // Callback set by MessageInput so auto-stop can trigger finishRecording().
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
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      startingRef.current = false;
      setError('Нет доступа к микрофону. Разрешите его в настройках браузера.');
      return;
    }

    // User already released the button while we were waiting for permission.
    if (pendingStopRef.current) {
      mediaStream.getTracks().forEach((t) => t.stop());
      startingRef.current = false;
      return;
    }

    setStream(mediaStream);

    const mimeType = pickMimeType();
    const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: VOICE_BITRATE_BPS };
    if (mimeType) recorderOptions.mimeType = mimeType;
    const recorder = new MediaRecorder(mediaStream, recorderOptions);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    startingRef.current = false;

    startTimeRef.current = Date.now();
    setIsRecording(true);

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedSeconds(elapsed);
      if (elapsed >= MAX_VOICE_DURATION_SECONDS) {
        // Max duration reached — send the recording via MessageInput's callback.
        void onMaxDurationRef.current?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [cleanup]);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    return new Promise((resolve) => {
      // Called before getUserMedia finished → signal the startup to abort.
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

      const mimeType = recorder.mimeType || 'audio/mp4';
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
    maxDurationSeconds: MAX_VOICE_DURATION_SECONDS,
    onMaxDurationRef,
  };
}
