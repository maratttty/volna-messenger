// Short UI sounds, synthesized via Web Audio API instead of shipping an audio
// file — no licensing concerns, no asset to load, near-zero latency.
const STORAGE_KEY = 'soundsEnabled';
const MIN_INTERVAL_MS = 150; // collapses bursts (bulk send/forward) into a single audible blip

let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === '1';
}

export function setSoundEnabled(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

function playTone(freqStart: number, freqEnd: number, durationMs: number, volume: number): void {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return;

  const ctx = getContext();
  if (!ctx) return;
  lastPlayedAt = now;
  if (ctx.state === 'suspended') void ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  const t0 = ctx.currentTime;
  const durationSec = durationMs / 1000;
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + durationSec);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec);
}

// Rising "swoosh/pop" — plays on successful send of the current user's own message.
export function playSendSound(): void {
  playTone(650, 1100, 90, 0.15);
}

// Quieter, lower "pop" — plays for an incoming message while its chat is open.
export function playReceiveSound(): void {
  playTone(480, 340, 110, 0.08);
}
