import { useEffect } from 'react';

/** Screen Wake Lock during active runs (§10.3), best-effort — silently no-ops if unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    (navigator as Navigator & { wakeLock: WakeLock }).wakeLock
      .request('screen')
      .then((s) => {
        if (cancelled) {
          s.release();
        } else {
          sentinel = s;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}

interface WakeLockSentinel {
  release: () => Promise<void>;
}
interface WakeLock {
  request: (type: 'screen') => Promise<WakeLockSentinel>;
}
