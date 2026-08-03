import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'pao-ath-dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * §10.3 — Safari evicts IndexedDB for sites not installed to the home screen, so
 * getting the user to install is part of first run, not an afterthought.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (dismissed || isStandalone()) return null;
  if (!deferredPrompt && !isIOS()) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  async function install() {
    if (deferredPrompt) {
      (deferredPrompt as Event & { prompt: () => void }).prompt();
    }
    dismiss();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        background: 'var(--felt-raised)',
        border: '1px solid var(--brass)',
        borderRadius: 10,
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      <strong style={{ color: 'var(--brass)' }}>Install this app</strong>
      <span style={{ color: 'var(--slate)' }}>
        {deferredPrompt
          ? 'Add PAO Card Trainer to your home screen — your data stays reliable offline this way.'
          : 'Tap Share, then "Add to Home Screen" — Safari can otherwise lose offline data for sites that are only bookmarked.'}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {deferredPrompt && (
          <button onClick={install} style={{ ...miniButton, background: 'var(--brass)', color: 'var(--ink)' }}>
            Install
          </button>
        )}
        <button onClick={dismiss} style={miniButton}>
          Not now
        </button>
      </div>
    </div>
  );
}

const miniButton: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(239,231,214,0.24)',
  borderRadius: 6,
  color: 'var(--stock)',
  padding: '6px 12px',
  fontSize: 12,
};
