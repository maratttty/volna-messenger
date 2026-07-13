import { useEffect, useRef } from 'react';
import { onNetworkRecovery } from '../lib/network';
import { hydrateSendStatusFromOutbox, processOutboxQueue } from '../lib/outbox';

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

// Mounted once near the app root (RequireAuth). Retries whatever is sitting
// in the outbox on a growing backoff, and immediately on reconnect — so a
// message queued while offline goes out on its own once the network is back,
// with no page reload or user action required.
export function useOutboxProcessor(enabled: boolean): void {
  const delayRef = useRef(BASE_DELAY_MS);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void hydrateSendStatusFromOutbox();

    async function tick() {
      if (cancelled) return;
      const hadSuccess = await processOutboxQueue().catch(() => false);
      delayRef.current = hadSuccess ? BASE_DELAY_MS : Math.min(delayRef.current * 2, MAX_DELAY_MS);
      if (!cancelled) timer = setTimeout(tick, delayRef.current);
    }

    timer = setTimeout(tick, delayRef.current);

    const stopWatching = onNetworkRecovery(() => {
      delayRef.current = BASE_DELAY_MS;
      if (timer) clearTimeout(timer);
      void tick();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopWatching();
    };
  }, [enabled]);
}
