import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

// Shows a "new version available" banner when the service worker installs
// an update. The user taps to reload and get the fresh version instantly.
export function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      // Detect when a new SW has been installed and is waiting to activate
      const checkWaiting = (sw: ServiceWorker | null) => {
        if (sw) setShow(true);
      };

      checkWaiting(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            setShow(true);
          }
        });
      });
    });

    // When the SW takes control (after skipWaiting), reload to get fresh assets
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  function handleUpdate() {
    navigator.serviceWorker.ready.then((reg) => {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-accent/10 px-4 py-2.5 text-sm">
      <RefreshCw size={16} className="shrink-0 text-accent" />
      <span className="flex-1 text-text">Доступна новая версия</span>
      <button
        onClick={handleUpdate}
        className="shrink-0 rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-hover"
      >
        Обновить
      </button>
    </div>
  );
}
