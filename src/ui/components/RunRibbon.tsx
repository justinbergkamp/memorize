export type TickState = 'pending' | 'filled' | 'correct' | 'wrong_card' | 'blank';

const TICK_COLOR: Record<TickState, string> = {
  pending: 'rgba(239,231,214,0.15)',
  filled: 'var(--brass)',
  correct: 'var(--brass)',
  wrong_card: 'var(--carmine)',
  blank: 'var(--slate)',
};

/**
 * §11.4 — the run's fingerprint. One tick per card. A collapsed scene (blank at
 * position 0) renders as one unbroken slate span across its three ticks, not three
 * separate marks — `mergeWithPrev[i]` removes the gap before tick i to achieve that.
 */
export function RunRibbon({ ticks, mergeWithPrev }: { ticks: TickState[]; mergeWithPrev?: boolean[] }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: 4, gap: 2 }}>
      {ticks.map((t, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: '100%',
            background: TICK_COLOR[t],
            marginLeft: mergeWithPrev?.[i] ? -2 : 0,
            transition: 'background 150ms',
          }}
        />
      ))}
    </div>
  );
}
