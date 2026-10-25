import { useEffect, useRef, useState } from 'react';
import { repository } from '@data/dexieRepository';
import type { FullExport } from '@data/repository';
import { useConfigStore } from '@store/configStore';
import { BuildScreen } from '@ui/build/BuildScreen';
import { TrainConfigScreen } from '@ui/train/TrainConfigScreen';
import { TrainRunScreen } from '@ui/train/TrainRunScreen';
import { RecallScreen } from '@ui/recall/RecallScreen';
import { AnalyzeScreen } from '@ui/analyze/AnalyzeScreen';
import { RunDetailScreen } from '@ui/analyze/RunDetailScreen';
import { InstallPrompt } from '@ui/components/InstallPrompt';
import { useTrainStore } from '@store/trainStore';

type Screen = 'home' | 'build' | 'train-config' | 'recall' | 'analyze' | { view: 'run-detail'; runId: string };

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const { load, loaded, filled } = useConfigStore();
  const trainPhase = useTrainStore((s) => s.phase);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const inActiveRun = trainPhase === 'memorize' || trainPhase === 'quiz' || trainPhase === 'summary';

  if (inActiveRun) {
    return <TrainRunScreen onExit={() => setScreen('home')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {screen === 'home' && <HomeScreen filled={filled} onNavigate={setScreen} />}
        {screen === 'build' && <BuildScreen />}
        {screen === 'train-config' && <TrainConfigScreen />}
        {screen === 'recall' && <RecallScreen />}
        {screen === 'analyze' && (
          <AnalyzeScreen onOpenRun={(runId) => setScreen({ view: 'run-detail', runId })} />
        )}
        {typeof screen === 'object' && screen.view === 'run-detail' && (
          <RunDetailScreen runId={screen.runId} onBack={() => setScreen('analyze')} />
        )}
      </main>
      {typeof screen === 'string' && (
        <nav
          style={{
            display: 'flex',
            borderTop: '1px solid rgba(239,231,214,0.1)',
            background: 'var(--felt-raised)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <NavButton label="Home" active={screen === 'home'} onClick={() => setScreen('home')} />
          <NavButton label="Build" active={screen === 'build'} onClick={() => setScreen('build')} />
          <NavButton label="Train" active={screen === 'train-config'} onClick={() => setScreen('train-config')} />
          <NavButton label="Recall" active={screen === 'recall'} onClick={() => setScreen('recall')} />
          <NavButton label="Analyze" active={screen === 'analyze'} onClick={() => setScreen('analyze')} />
        </nav>
      )}
    </div>
  );
}

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '12px 0',
        background: 'transparent',
        border: 'none',
        color: active ? 'var(--brass)' : 'var(--slate)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function HomeScreen({
  filled,
  onNavigate,
}: {
  filled: number;
  onNavigate: (s: Screen) => void;
}) {
  const gateOpen = filled >= 52;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleExportAll() {
    const data = await repository.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pao-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportAll(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as FullExport;
    if (data.schema_version !== 1) {
      alert(`Unsupported backup file (schema version ${data.schema_version}).`);
      return;
    }
    if (!confirm('Import will merge this backup into your current data. Continue?')) return;
    await repository.importAll(data);
    location.reload();
  }

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-rank)', fontSize: 36, margin: '24px 0 8px' }}>PAO Card Trainer</h1>
      <p style={{ color: 'var(--slate)', marginBottom: 24 }}>
        Drill your Person-Action-Object system for a shuffled 52-card deck. Everything stays on this device.
      </p>
      <InstallPrompt />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button onClick={() => onNavigate('build')} style={cardButtonStyle}>
          <strong>Build</strong>
          <span style={{ color: 'var(--slate)', fontSize: 13 }}>
            {gateOpen ? 'Complete' : `${filled} / 52 entries`}
          </span>
        </button>
        <button
          onClick={() => gateOpen && onNavigate('train-config')}
          style={{ ...cardButtonStyle, opacity: gateOpen ? 1 : 0.5 }}
          disabled={!gateOpen}
        >
          <strong>Train</strong>
          <span style={{ color: 'var(--slate)', fontSize: 13 }}>
            {gateOpen ? 'Ready' : 'Complete Build first'}
          </span>
        </button>
        <button
          onClick={() => gateOpen && onNavigate('recall')}
          style={{ ...cardButtonStyle, opacity: gateOpen ? 1 : 0.5 }}
          disabled={!gateOpen}
        >
          <strong>Recall</strong>
          <span style={{ color: 'var(--slate)', fontSize: 13 }}>
            {gateOpen ? 'See a Person, Action or Object, name the card' : 'Complete Build first'}
          </span>
        </button>
        <button onClick={() => onNavigate('analyze')} style={cardButtonStyle}>
          <strong>Analyze</strong>
          <span style={{ color: 'var(--slate)', fontSize: 13 }}>Run history and weak items</span>
        </button>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
        <button onClick={handleExportAll} style={dataButtonStyle}>
          Export all data
        </button>
        <button onClick={() => fileInputRef.current?.click()} style={dataButtonStyle}>
          Import backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportAll(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

const dataButtonStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--felt-raised)',
  border: '1px solid rgba(239,231,214,0.16)',
  borderRadius: 8,
  color: 'var(--slate)',
  padding: '8px 10px',
  fontSize: 12,
};

const cardButtonStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  padding: '16px 18px',
  background: 'var(--felt-raised)',
  border: '1px solid rgba(239,231,214,0.12)',
  borderRadius: 12,
  color: 'var(--stock)',
  fontSize: 16,
  textAlign: 'left',
};
