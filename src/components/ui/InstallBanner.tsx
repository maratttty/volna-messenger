import { useState, useEffect } from 'react';
import { X, Download, Share } from 'lucide-react';

// Fires in Android Chrome before the native install prompt is shown.
// We intercept it to show our own button instead.
let deferredPrompt: { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null = null;

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export function InstallBanner() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (isInStandaloneMode()) return;
    // Don't show if already dismissed this session
    if (sessionStorage.getItem('install-dismissed')) return;

    if (isIos()) {
      // iOS: always guide manually (no auto-prompt exists)
      setPlatform('ios');
      setShow(true);
      return;
    }

    // Android / desktop Chrome: wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as unknown as typeof deferredPrompt;
      setPlatform('android');
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem('install-dismissed', '1');
    setShow(false);
  }

  async function handleInstallAndroid() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    deferredPrompt = null;
  }

  if (!show) return null;

  return (
    <div className="flex items-start gap-3 border-b border-border bg-accent/10 px-4 py-3 text-sm">
      {platform === 'android' ? (
        <>
          <Download size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="flex-1">
            <p className="font-medium text-text">Установить Freeword</p>
            <p className="text-xs text-text-muted">Добавь как приложение — без браузера</p>
          </div>
          <button
            onClick={() => void handleInstallAndroid()}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover"
          >
            Установить
          </button>
          <button onClick={dismiss} className="shrink-0 rounded-md p-1 text-text-muted hover:text-text">
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <Share size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="flex-1">
            <p className="font-medium text-text">Добавить на экран Домой</p>
            <p className="text-xs text-text-muted leading-relaxed">
              Открой эту страницу в <strong>Safari</strong>, нажми&nbsp;
              <span className="inline-block rounded bg-surface px-1 font-mono text-[11px]">⎙</span>
              &nbsp;→ «На экран Домой»
            </p>
          </div>
          <button onClick={dismiss} className="shrink-0 rounded-md p-1 text-text-muted hover:text-text">
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}
