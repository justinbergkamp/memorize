import { useEffect, useState } from 'react';
import { repository } from '@data/dexieRepository';

/**
 * §X — soft-exclude a progression run as "botched" (phone rang, mis-swipe...). The run and its events
 * are kept; it just stops counting toward the progression interval. Reversible.
 */
export function BotchedToggle({ runId, onChange }: { runId: string; onChange?: (excluded: boolean) => void }) {
  const [excluded, setExcluded] = useState<boolean | null>(null);

  useEffect(() => {
    repository.getRun(runId).then((r) => setExcluded(!!r?.excluded));
  }, [runId]);

  if (excluded === null) return null;

  async function toggle() {
    const next = !excluded;
    await repository.setRunExcluded(runId, next);
    setExcluded(next);
    onChange?.(next);
  }

  return (
    <button
      onClick={toggle}
      style={{
        background: 'var(--felt-raised)',
        border: `1px solid ${excluded ? 'var(--carmine)' : 'rgba(239,231,214,0.16)'}`,
        borderRadius: 8,
        color: excluded ? 'var(--carmine)' : 'var(--stock)',
        padding: '8px 14px',
        fontSize: 13,
      }}
    >
      {excluded ? 'Botched — not counted (tap to restore)' : 'Mark as botched'}
    </button>
  );
}
