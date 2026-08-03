import { useTrainStore } from '@store/trainStore';

export function SummaryScreen({ onExit }: { onExit: () => void }) {
  const { header, summaryRollup, reset } = useTrainStore();
  if (!header || !summaryRollup) return null;

  const pct = summaryRollup.n_cards > 0 ? Math.round((summaryRollup.n_correct / summaryRollup.n_cards) * 100) : null;
  const totalSec = Math.round(summaryRollup.total_ms / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = String(totalSec % 60).padStart(2, '0');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
        background: 'var(--felt)',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontFamily: 'var(--font-rank)', fontSize: 32, margin: 0 }}>
        {header.is_practice ? 'Practice complete' : 'Run complete'}
      </h1>
      <div className="mono" style={{ fontSize: 40, color: 'var(--brass)' }}>
        {pct !== null ? `${pct}%` : `${summaryRollup.n_cards} cards`}
      </div>
      <div className="mono" style={{ fontSize: 15, color: 'var(--slate)' }}>
        {mm}m {ss}s · {summaryRollup.n_cards} cards
      </div>
      {header.params.quizzed && (
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <Stat label="Correct" value={summaryRollup.n_correct} color="var(--brass)" />
          <Stat label="Wrong card" value={summaryRollup.n_wrong_card} color="var(--carmine)" />
          <Stat label="Blank" value={summaryRollup.n_blank} color="var(--slate)" />
        </div>
      )}
      <button
        onClick={() => {
          reset();
          onExit();
        }}
        style={{
          marginTop: 16,
          background: 'var(--brass)',
          color: 'var(--ink)',
          border: 'none',
          borderRadius: 10,
          padding: '14px 32px',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Done
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span className="mono" style={{ fontSize: 20, color }}>
        {value}
      </span>
      <span style={{ color: 'var(--slate)' }}>{label}</span>
    </div>
  );
}
