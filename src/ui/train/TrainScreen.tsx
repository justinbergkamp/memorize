import { useState } from 'react';
import { RecallScreen } from '@ui/recall/RecallScreen';
import { TrainConfigScreen } from './TrainConfigScreen';

type Mode = 'run' | 'recall';

/** Train tab: pick between configuring a memorize/quiz run and the Recall (P/A/O -> card) drill. */
export function TrainScreen() {
  const [mode, setMode] = useState<Mode>('run');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 12px 0', justifyContent: 'center' }}>
        <ModeButton label="Run" active={mode === 'run'} onClick={() => setMode('run')} />
        <ModeButton label="Recall" active={mode === 'recall'} onClick={() => setMode('recall')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {mode === 'run' ? <TrainConfigScreen /> : <RecallScreen />}
      </div>
    </div>
  );
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--brass)' : 'var(--felt-raised)',
        color: active ? 'var(--ink)' : 'var(--stock)',
        border: 'none',
        borderRadius: 20,
        padding: '8px 20px',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}
