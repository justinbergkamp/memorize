import { useEffect, useMemo, useRef } from 'react';
import { fullDeck, SUITS, suitSymbol, type Suit } from '@domain/cards';
import { repository } from '@data/dexieRepository';
import type { ConfigExport } from '@data/repository';
import { useConfigStore } from '@store/configStore';
import { PaoRow } from './PaoRow';

const SUIT_LABEL: Record<Suit, string> = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };

export function BuildScreen() {
  const { entries, loaded, filled, total, load, setEntry } = useConfigStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const bySuit = useMemo(() => {
    const groups = new Map<Suit, string[]>();
    for (const suit of SUITS) groups.set(suit, []);
    for (const card of fullDeck()) groups.get(card[1] as Suit)!.push(card);
    return groups;
  }, []);

  async function handleExport() {
    const config = await repository.exportConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pao-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as ConfigExport;
    if (data.schema_version !== 1) {
      alert(`Unsupported config file (schema version ${data.schema_version}).`);
      return;
    }
    await repository.importConfig(data);
    await load();
  }

  if (!loaded) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: '16px 12px 100px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-rank)', fontSize: 28, margin: '0 0 4px' }}>Build</h1>
        <p style={{ margin: 0, color: 'var(--slate)', fontSize: 14 }}>
          Enter your Person, Action, and Object for every card. This never touches past run data.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <span className="mono" style={{ fontSize: 20, color: filled >= total ? 'var(--brass)' : 'var(--stock)' }}>
            {filled} / {total}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: 'var(--felt-raised)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(filled / total) * 100}%`,
                height: '100%',
                background: 'var(--brass)',
                transition: 'width 200ms',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={handleExport} style={buttonStyle}>
            Export config
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={buttonStyle}>
            Import config
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {SUITS.map((suit) => (
        <section key={suit} style={{ marginBottom: 20 }}>
          <h2
            style={{
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'var(--slate)',
              margin: '0 0 4px',
            }}
          >
            {suitSymbol(suit)} {SUIT_LABEL[suit]}
          </h2>
          {bySuit.get(suit)!.map((card) => (
            <PaoRow key={card} card={card} value={entries[card]} onSave={setEntry} />
          ))}
        </section>
      ))}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: 'var(--felt-raised)',
  border: '1px solid rgba(239,231,214,0.16)',
  borderRadius: 8,
  color: 'var(--stock)',
  padding: '8px 14px',
  fontSize: 14,
};
