import { useUploadProgressStore } from '../store/upload-progress-store';

// Drives the upload progress ring at a continuous, speed-capped pace instead
// of writing raw XHR progress ticks straight into the store. Real ticks are
// sparse and uneven — a small file (a short voice note) can go 0 -> 100 in a
// single tick with nothing in between, and a large file over a fast
// connection can jump 10-30% in one event. Snapping to either produces a
// ring that's invisible (no time on screen) or jerky (instant snaps). This
// instead always moves the displayed value toward the real target (or, if no
// real ticks have arrived yet, toward a synthetic floor that climbs on its
// own) at a fixed max speed — so the ring is always sweeping smoothly, never
// teleporting, and finishes in MIN_SWEEP_MS at the fastest.
const MIN_SWEEP_MS = 400;
const MAX_STEP_PER_MS = 1 / MIN_SWEEP_MS;
const SYNTHETIC_FLOOR_CAP = 0.9; // never fake past 90% — only a real "done" can close the last stretch

export function createUploadRingAnimator(clientId: string) {
  const startedAt = performance.now();
  let target = 0;
  let done = false;
  let displayed = 0;
  let lastTs = 0;
  let rafId = 0;
  let resolveCompleted: () => void = () => {};
  const completed = new Promise<void>((resolve) => {
    resolveCompleted = resolve;
  });

  const tick = (ts: number) => {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    const syntheticFloor = Math.min(SYNTHETIC_FLOOR_CAP, (ts - startedAt) / MIN_SWEEP_MS);
    const ceiling = done ? 1 : Math.max(target, syntheticFloor);
    displayed = Math.min(ceiling, displayed + MAX_STEP_PER_MS * dt);
    useUploadProgressStore.getState().setProgress(clientId, displayed);

    if (displayed >= 1) {
      resolveCompleted();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    // Real progress ticks only ever raise the target — a late/out-of-order
    // small tick can't drag a further-along sweep backwards.
    setTarget(fraction: number) {
      if (fraction > target) target = fraction;
    },
    finish() {
      done = true;
    },
    // Stops writing to the store immediately — used on cancel/error, where
    // the caller takes over the visual state right away (no reason to let
    // an in-flight animation frame overwrite whatever it sets next).
    cancel() {
      cancelAnimationFrame(rafId);
      resolveCompleted();
    },
    completed,
  };
}
